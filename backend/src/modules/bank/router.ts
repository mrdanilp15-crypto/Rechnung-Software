import { Router } from "express";
import multer from "multer";
import { parse } from "csv-parse/sync";
import { z } from "zod";
import { prisma } from "../../db/prisma";
import { requireAuth, requireRole } from "../../middleware/auth";
import { HttpError } from "../../middleware/errorHandler";
import { writeAuditLog } from "../audit/auditLog";
import { emitEvent } from "../plugins/hooks";
import { bankFingerprint, parseBankRow } from "./parse";
import { autoMatch, suggestMatches, type OpenInvoice } from "./match";

export const bankRouter = Router();
bankRouter.use(requireAuth, requireRole("ADMIN", "BUCHHALTUNG"));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

bankRouter.get("/transactions", async (req, res) => {
  const transactions = await prisma.bankTransaction.findMany({
    where: { companyId: req.auth!.companyId },
    orderBy: { bookingDate: "desc" },
  });
  res.json(transactions);
});

async function openInvoices(companyId: string): Promise<(OpenInvoice & { status: string })[]> {
  const rows = await prisma.invoice.findMany({
    where: { companyId, status: { in: ["SENT", "OVERDUE"] }, isCancellationDocument: false },
    select: { id: true, invoiceNumber: true, totalCents: true, status: true, customer: { select: { name: true } } },
  });
  return rows.map((r) => ({ id: r.id, number: r.invoiceNumber, totalCents: r.totalCents, status: r.status, customer: r.customer.name }));
}

/**
 * Importiert einen Kontoauszug als CSV (kein Live-Bank-API-Zugriff, siehe schema.prisma bei BankTransaction).
 * Die Spaltennamen verschiedener Banken werden erkannt (z.B. Buchungstag, Betrag, Verwendungszweck, Beguenstigter/Zahlungspflichtiger oder
 * bookingDate, amount, purpose, counterparty); Datum als TT.MM.JJJJ, TT.MM.JJ oder JJJJ-MM-TT, Beträge deutsch oder englisch.
 * Schon importierte Buchungen (gleiches Datum, Betrag, Zweck und Gegenseite) werden übersprungen - dieselbe Datei kann also gefahrlos erneut
 * importiert werden. Gutschriften werden automatisch nur bei eindeutigem Treffer (Betrag UND Rechnungsnummer im Verwendungszweck) als bezahlt
 * zugeordnet; für den Rest macht GET /suggestions Vorschläge, die per Klick bestätigt werden.
 */
bankRouter.post("/import", upload.single("file"), async (req, res) => {
  if (!req.file) throw new HttpError(400, "Keine Datei erhalten");
  const companyId = req.auth!.companyId;
  let records: Record<string, string>[];
  try {
    // BOM entfernen (Excel/Bank-Exporte), Trenner Komma oder Semikolon
    const text = req.file.buffer.toString("utf8").replace(/^﻿/, "");
    records = parse(text, { columns: true, skip_empty_lines: true, trim: true, delimiter: [",", ";"], relax_column_count: true });
  } catch {
    throw new HttpError(400, "CSV konnte nicht gelesen werden");
  }
  if (records.length > 5000) throw new HttpError(400, "Maximal 5000 Zeilen pro Import erlaubt");

  const invoices = await openInvoices(companyId);
  const existing = await prisma.bankTransaction.findMany({ where: { companyId }, select: { bookingDate: true, amountCents: true, purpose: true, counterparty: true } });
  const seen = new Set(existing.map((t) => bankFingerprint(t.bookingDate, t.amountCents, t.purpose ?? "", t.counterparty ?? "")));

  let imported = 0;
  let matched = 0;
  let duplicates = 0;
  let toReview = 0;
  const errors: string[] = [];
  const usedInvoices = new Set<string>();

  for (const [idx, row] of records.entries()) {
    const parsed = parseBankRow(row);
    if (!parsed.ok) {
      errors.push(`Zeile ${idx + 2}: ${parsed.error}`);
      continue;
    }
    const fp = bankFingerprint(parsed.date, parsed.amountCents, parsed.purpose, parsed.counterparty);
    if (seen.has(fp)) {
      duplicates++;
      continue;
    }
    seen.add(fp);

    const match = autoMatch({ amountCents: parsed.amountCents, purpose: parsed.purpose }, invoices.filter((i) => !usedInvoices.has(i.id)));
    const tx = await prisma.bankTransaction.create({
      data: { companyId, bookingDate: parsed.date, amountCents: parsed.amountCents, purpose: parsed.purpose, counterparty: parsed.counterparty, matchedInvoiceId: match?.id },
    });
    imported++;

    if (match) {
      matched++;
      usedInvoices.add(match.id);
      const updated = await prisma.invoice.update({ where: { id: match.id }, data: { status: "PAID", paidAt: tx.bookingDate } });
      await writeAuditLog({ req, companyId, userId: req.auth!.sub, action: "invoice.auto_matched_paid", entityType: "Invoice", entityId: match.id, metadata: { bankTransactionId: tx.id } });
      await emitEvent("invoice.paid", { companyId, invoice: updated });
    } else if (parsed.amountCents > 0) {
      toReview++;
    }
  }

  await writeAuditLog({ req, companyId, userId: req.auth!.sub, action: "bank.import", entityType: "BankTransaction", metadata: { imported, matched, duplicates, errorCount: errors.length } });
  res.json({ imported, matched, duplicates, toReview, errors });
});

// Zahlungseingänge, die noch keiner Rechnung zugeordnet sind, mit Vorschlägen
bankRouter.get("/suggestions", async (req, res) => {
  const companyId = req.auth!.companyId;
  const [txs, invoices] = await Promise.all([
    prisma.bankTransaction.findMany({ where: { companyId, amountCents: { gt: 0 }, matchedInvoiceId: null, ignored: false }, orderBy: { bookingDate: "desc" }, take: 100 }),
    openInvoices(companyId),
  ]);
  res.json(txs.map((t) => ({ transaction: t, suggestions: suggestMatches({ amountCents: t.amountCents, purpose: t.purpose ?? "", counterparty: t.counterparty ?? "" }, invoices) })));
});

const matchSchema = z.object({ invoiceId: z.string().min(1), acceptDifference: z.boolean().optional() });

// Zahlung einer Rechnung zuordnen (Bestätigung eines Vorschlags oder von Hand): Rechnung wird als bezahlt markiert
bankRouter.post("/transactions/:id/match", async (req, res) => {
  const companyId = req.auth!.companyId;
  const body = matchSchema.parse(req.body);
  const tx = await prisma.bankTransaction.findFirst({ where: { id: req.params.id, companyId } });
  if (!tx) throw new HttpError(404, "Buchung nicht gefunden");
  if (tx.matchedInvoiceId) throw new HttpError(409, "Diese Buchung ist schon einer Rechnung zugeordnet.");
  if (tx.amountCents <= 0) throw new HttpError(400, "Nur Zahlungseingänge lassen sich Rechnungen zuordnen.");
  const invoice = await prisma.invoice.findFirst({ where: { id: body.invoiceId, companyId, isCancellationDocument: false } });
  if (!invoice) throw new HttpError(404, "Rechnung nicht gefunden");
  if (invoice.status !== "SENT" && invoice.status !== "OVERDUE") throw new HttpError(409, "Diese Rechnung ist nicht (mehr) offen.");
  const diff = tx.amountCents - invoice.totalCents;
  if (diff !== 0 && !body.acceptDifference) {
    const eur = (c: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(c / 100).replace(/ /g, " ");
    throw new HttpError(409, `Der Betrag weicht um ${eur(Math.abs(diff))} ab (Zahlung ${eur(tx.amountCents)}, Rechnung ${eur(invoice.totalCents)}). Nur zuordnen, wenn die Rechnung damit erledigt ist (z.B. Skonto).`);
  }
  const [, updated] = await prisma.$transaction([
    prisma.bankTransaction.update({ where: { id: tx.id }, data: { matchedInvoiceId: invoice.id } }),
    prisma.invoice.update({ where: { id: invoice.id }, data: { status: "PAID", paidAt: tx.bookingDate } }),
  ]);
  await writeAuditLog({ req, companyId, userId: req.auth!.sub, action: "invoice.bank_matched_paid", entityType: "Invoice", entityId: invoice.id, metadata: { bankTransactionId: tx.id, diffCents: diff } });
  await emitEvent("invoice.paid", { companyId, invoice: updated });
  res.json({ ok: true, diffCents: diff });
});

// Buchung als "gehört zu keiner Rechnung" ausblenden (z.B. private Einlage) bzw. wieder einblenden
bankRouter.post("/transactions/:id/ignore", async (req, res) => {
  const { ignored } = z.object({ ignored: z.boolean() }).parse(req.body);
  const tx = await prisma.bankTransaction.findFirst({ where: { id: req.params.id, companyId: req.auth!.companyId } });
  if (!tx) throw new HttpError(404, "Buchung nicht gefunden");
  await prisma.bankTransaction.update({ where: { id: tx.id }, data: { ignored } });
  res.json({ ok: true });
});
