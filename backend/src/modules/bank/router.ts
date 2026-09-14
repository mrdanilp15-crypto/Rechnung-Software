import { Router } from "express";
import multer from "multer";
import { parse } from "csv-parse/sync";
import { prisma } from "../../db/prisma";
import { requireAuth, requireRole } from "../../middleware/auth";
import { HttpError } from "../../middleware/errorHandler";
import { writeAuditLog } from "../audit/auditLog";
import { emitEvent } from "../plugins/hooks";

export const bankRouter = Router();
bankRouter.use(requireAuth, requireRole("ADMIN", "BUCHHALTUNG"));

/**
 * Parst einen Geldbetrag sowohl im deutschen Format ("1.234,56") als auch im
 * ISO-/englischen Format ("1234.56" bzw. "21.42") - Bank-CSV-Exporte verwenden je nach
 * Bank/Ländereinstellung unterschiedliche Trennzeichen. Enthält der String ein Komma,
 * wird es als Dezimaltrennzeichen behandelt (Punkte davor sind dann Tausendertrenner).
 * Ohne Komma wird der Punkt direkt als Dezimaltrennzeichen interpretiert. Ein rein
 * deutscher Tausenderpunkt ohne Komma und ohne Nachkommastellen (z.B. "1.234" für
 * 1234 €) kann dadurch nicht von "1,234 €" unterschieden werden - seltener Grenzfall.
 */
function parseGermanOrIsoAmount(raw: string): number {
  const trimmed = raw.trim();
  if (trimmed.includes(",")) {
    return parseFloat(trimmed.replace(/\./g, "").replace(",", "."));
  }
  return parseFloat(trimmed);
}

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

bankRouter.get("/transactions", async (req, res) => {
  const transactions = await prisma.bankTransaction.findMany({
    where: { companyId: req.auth!.companyId },
    orderBy: { bookingDate: "desc" },
  });
  res.json(transactions);
});

/**
 * Importiert einen Kontoauszug als CSV (kein Live-Bank-API-Zugriff, siehe schema.prisma
 * bei BankTransaction). Erwartetes Spaltenformat: bookingDate,amount,purpose,counterparty
 * (amount in Euro, Punkt oder Komma als Dezimaltrennzeichen, positiv = Zahlungseingang).
 * Die meisten Banken bieten einen CSV-Export mit diesen oder ähnlichen Spalten an - bei
 * abweichenden Spaltennamen bitte vor dem Import in Excel/LibreOffice umbenennen.
 *
 * Nach dem Import wird automatisch versucht, jede Gutschrift einer offenen Rechnung
 * zuzuordnen: exakte Betragsübereinstimmung UND die Rechnungsnummer taucht im
 * Verwendungszweck auf. Bei eindeutigem Treffer wird die Rechnung automatisch als
 * bezahlt markiert.
 */
bankRouter.post("/import", upload.single("file"), async (req, res) => {
  if (!req.file) throw new HttpError(400, "Keine Datei erhalten");
  let records: Record<string, string>[];
  try {
    records = parse(req.file.buffer.toString("utf8"), { columns: true, skip_empty_lines: true, trim: true, delimiter: [",", ";"] });
  } catch {
    throw new HttpError(400, "CSV konnte nicht gelesen werden");
  }
  if (records.length > 5000) throw new HttpError(400, "Maximal 5000 Zeilen pro Import erlaubt");

  const openInvoices = await prisma.invoice.findMany({
    where: { companyId: req.auth!.companyId, status: { in: ["SENT", "OVERDUE"] } },
  });

  let imported = 0;
  let matched = 0;
  const errors: string[] = [];

  for (const [idx, row] of records.entries()) {
    const bookingDate = row.bookingDate || row.Buchungstag || row.date;
    const rawAmount = row.amount || row.Betrag;
    if (!bookingDate || !rawAmount) {
      errors.push(`Zeile ${idx + 2}: bookingDate/amount fehlt`);
      continue;
    }
    const amountEur = parseGermanOrIsoAmount(rawAmount);
    if (Number.isNaN(amountEur)) {
      errors.push(`Zeile ${idx + 2}: Betrag "${rawAmount}" nicht lesbar`);
      continue;
    }
    const amountCents = Math.round(amountEur * 100);
    const purpose = row.purpose || row.Verwendungszweck || "";
    const counterparty = row.counterparty || row.Zahlungspflichtiger || row.Empfaenger || "";

    const match = amountCents > 0 ? openInvoices.find((inv) => inv.totalCents === amountCents && purpose.includes(inv.invoiceNumber)) : undefined;

    const tx = await prisma.bankTransaction.create({
      data: {
        companyId: req.auth!.companyId,
        bookingDate: new Date(bookingDate),
        amountCents,
        purpose,
        counterparty,
        matchedInvoiceId: match?.id,
      },
    });
    imported++;

    if (match) {
      matched++;
      const updated = await prisma.invoice.update({ where: { id: match.id }, data: { status: "PAID", paidAt: tx.bookingDate } });
      await writeAuditLog({ req, companyId: req.auth!.companyId, userId: req.auth!.sub, action: "invoice.auto_matched_paid", entityType: "Invoice", entityId: match.id, metadata: { bankTransactionId: tx.id } });
      await emitEvent("invoice.paid", { companyId: req.auth!.companyId, invoice: updated });
    }
  }

  await writeAuditLog({ req, companyId: req.auth!.companyId, userId: req.auth!.sub, action: "bank.import", entityType: "BankTransaction", metadata: { imported, matched, errorCount: errors.length } });
  res.json({ imported, matched, errors });
});
