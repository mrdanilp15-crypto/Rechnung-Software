import { Router } from "express";
import fs from "fs";
import os from "os";
import path from "path";
import { zip } from "zip-a-folder";
import { Parser as CsvParser } from "json2csv";
import { prisma } from "../../db/prisma";
import { requireAuth, requireRole } from "../../middleware/auth";
import { HttpError } from "../../middleware/errorHandler";
import { writeAuditLog } from "../audit/auditLog";
import { env } from "../../config/env";
import { bookValueAtYearEnd, depreciationForYear } from "../assets/depreciation";
import { generateAndStoreInvoicePdf } from "../invoices/pdfHelper";

export const accountingRouter = Router();
accountingRouter.use(requireAuth);

const eurDe = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");
const dateDe = (d?: Date | null) => (d ? new Intl.DateTimeFormat("de-DE").format(d) : "");
const safeName = (s: string) => s.replace(/[^\p{L}\p{N}._-]+/gu, "_").slice(0, 60);

function csv(rows: Record<string, unknown>[], fields: string[]): string {
  // Semikolon + Dezimalkomma + BOM: öffnet sich in deutschem Excel direkt korrekt
  return new CsvParser({ fields, delimiter: ";", withBOM: true }).parse(rows);
}

/** Zeitraum aus ?year=2026&period=year|q1..q4|m1..m12 */
function parsePeriod(query: Record<string, unknown>): { from: Date; to: Date; label: string } {
  const year = Number(query.year) || new Date().getFullYear();
  const period = String(query.period ?? "year").toLowerCase();
  const q = /^q([1-4])$/.exec(period);
  const m = /^m(1[0-2]|[1-9])$/.exec(period);
  if (q) {
    const idx = Number(q[1]) - 1;
    return { from: new Date(year, idx * 3, 1), to: new Date(year, idx * 3 + 3, 1), label: `${q[1]}. Quartal ${year}` };
  }
  if (m) {
    const idx = Number(m[1]) - 1;
    return { from: new Date(year, idx, 1), to: new Date(year, idx + 1, 1), label: `${String(idx + 1).padStart(2, "0")}/${year}` };
  }
  return { from: new Date(year, 0, 1), to: new Date(year + 1, 0, 1), label: String(year) };
}

interface VatRow {
  key: string;
  label: string;
  kz: string | null;
  netCents: number;
  vatCents: number;
}

const STATUS_DE: Record<string, string> = { SENT: "Versendet", PAID: "Bezahlt", OVERDUE: "Überfällig", CANCELLED: "Storniert" };

const NOTICE_ROWS: Record<string, { label: string; kz: string }> = {
  INTRA_COMMUNITY_SUPPLY: { label: "Steuerfreie innergemeinschaftliche Lieferungen", kz: "41" },
  EXPORT: { label: "Steuerfreie Ausfuhrlieferungen", kz: "43" },
  REVERSE_CHARGE: { label: "Sonstige Leistungen an Unternehmer im EU-Ausland (nicht steuerbar, §18b)", kz: "21" },
  NOT_TAXABLE_ABROAD: { label: "Übrige nicht steuerbare Umsätze (Leistungsort im Drittland)", kz: "45" },
};

/**
 * Umsätze und Vorsteuer eines Zeitraums nach Steuersätzen/Befreiungen - Orientierungshilfe für die
 * Umsatzsteuer-Voranmeldung. Grundlage ist das Rechnungsdatum (Sollversteuerung); Korrekturbelege (Storno)
 * mindern den Umsatz in dem Zeitraum, in dem sie ausgestellt wurden (§17 UStG), das stornierte Original bleibt
 * in seinem ursprünglichen Zeitraum stehen. Bei Ist-Versteuerung weichen die Werte ab.
 */
async function computeVatSummary(companyId: string, from: Date, to: Date) {
  const invoices = await prisma.invoice.findMany({
    where: { companyId, status: { not: "DRAFT" }, issueDate: { gte: from, lt: to } },
    include: { items: true },
  });
  const rows = new Map<string, VatRow>();
  const add = (key: string, label: string, kz: string | null, net: number, vat: number) => {
    const row = rows.get(key) ?? { key, label, kz, netCents: 0, vatCents: 0 };
    row.netCents += net;
    row.vatCents += vat;
    rows.set(key, row);
  };
  for (const inv of invoices) {
    for (const item of inv.items) {
      const net = item.lineTotalCents;
      const vat = Math.round((net * item.vatRateBps) / 10000);
      if (inv.isSmallBusiness) add("SMALL", "Umsätze nach §19 UStG (Kleinunternehmer, keine USt.)", null, net, 0);
      else if (inv.vatNoticeKey && NOTICE_ROWS[inv.vatNoticeKey]) add(inv.vatNoticeKey, NOTICE_ROWS[inv.vatNoticeKey].label, NOTICE_ROWS[inv.vatNoticeKey].kz, net, 0);
      else {
        const pct = item.vatRateBps / 100;
        const kz = item.vatRateBps === 1900 ? "81" : item.vatRateBps === 700 ? "86" : null;
        add(`RATE_${item.vatRateBps}`, `Steuerpflichtige Umsätze zu ${pct} %`, kz, net, vat);
      }
    }
  }

  const expenses = await prisma.expense.findMany({ where: { companyId, date: { gte: from, lt: to } } });
  let inputVatCents = 0;
  let expenseNetCents = 0;
  for (const e of expenses) {
    const net = Math.round(e.amountCents / (1 + e.vatRateBps / 10000));
    inputVatCents += e.amountCents - net;
    expenseNetCents += net;
  }

  const list = [...rows.values()].sort((a, b) => (b.kz ?? "").localeCompare(a.kz ?? ""));
  const outputVatCents = list.reduce((s, r) => s + r.vatCents, 0);
  return { rows: list, outputVatCents, inputVatCents, expenseNetCents, payableCents: outputVatCents - inputVatCents, invoiceCount: invoices.length, expenseCount: expenses.length };
}

accountingRouter.get("/vat-summary", async (req, res) => {
  const { from, to, label } = parsePeriod(req.query);
  const summary = await computeVatSummary(req.auth!.companyId, from, to);
  res.json({ period: label, from, to, ...summary });
});

/**
 * Steuerberater-Paket (ZIP) für ein Jahr: Einnahmen- und Ausgabenliste (CSV, Excel-tauglich), Umsatzsteuer-Übersicht
 * je Quartal, alle ausgestellten Rechnungen als PDF und die hochgeladenen Ausgabenbelege. KEIN DATEV-Buchungsstapel -
 * die Kontenzuordnung (SKR03/04) übernimmt die Kanzlei.
 */
accountingRouter.get("/package", requireRole("ADMIN", "BUCHHALTUNG"), async (req, res) => {
  const companyId = req.auth!.companyId;
  const year = Number(req.query.year) || new Date().getFullYear();
  const from = new Date(year, 0, 1);
  const to = new Date(year + 1, 0, 1);

  const company = await prisma.company.findUniqueOrThrow({ where: { id: companyId } });
  const invoices = await prisma.invoice.findMany({
    where: { companyId, status: { not: "DRAFT" }, issueDate: { gte: from, lt: to } },
    include: { items: true, customer: true, company: true, correctsInvoice: { select: { invoiceNumber: true } } },
    orderBy: { issueDate: "asc" },
    take: 5000,
  });
  const expenses = await prisma.expense.findMany({ where: { companyId, date: { gte: from, lt: to } }, orderBy: { date: "asc" } });
  const archived = await prisma.archiveDocument.findMany({ where: { companyId, documentDate: { gte: from, lt: to } }, orderBy: { documentDate: "asc" }, take: 5000 });
  if (invoices.length === 0 && expenses.length === 0 && archived.length === 0) throw new HttpError(404, `Für ${year} gibt es keine ausgestellten Rechnungen, Ausgaben oder Archiv-Dokumente.`);

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "steuerberater-"));
  const root = path.join(tmp, `steuerberater-${year}`);
  fs.mkdirSync(path.join(root, "rechnungen"), { recursive: true });
  fs.mkdirSync(path.join(root, "belege"), { recursive: true });
  const cleanup = () => fs.rmSync(tmp, { recursive: true, force: true });

  try {
    // Einnahmen
    const incomeRows = invoices.map((inv) => {
      const rates = [...new Set(inv.items.map((i) => i.vatRateBps / 100))].join("/");
      return {
        Rechnungsnummer: inv.invoiceNumber ?? "",
        Art: inv.isCancellationDocument ? "Korrekturbeleg" : "Rechnung",
        Korrekturzu: inv.correctsInvoice?.invoiceNumber ?? "",
        Rechnungsdatum: dateDe(inv.issueDate),
        Leistungsdatum: dateDe(inv.deliveryDate ?? inv.issueDate),
        Kunde: inv.customer.name,
        Kundennummer: inv.customer.customerNumber,
        KundeUStIdNr: inv.customer.vatId ?? "",
        Land: inv.customer.country,
        Netto: eurDe(inv.subtotalCents),
        Umsatzsteuer: eurDe(inv.vatTotalCents),
        Brutto: eurDe(inv.totalCents),
        Steuersatz: rates,
        Steuerhinweis: inv.isSmallBusiness ? "Kleinunternehmer §19 UStG" : inv.vatNoticeKey ? NOTICE_ROWS[inv.vatNoticeKey]?.label ?? inv.vatNoticeKey : "",
        Status: STATUS_DE[inv.status] ?? inv.status,
        BezahltAm: dateDe(inv.paidAt),
      };
    });
    fs.writeFileSync(
      path.join(root, "einnahmen.csv"),
      csv(incomeRows, ["Rechnungsnummer", "Art", "Korrekturzu", "Rechnungsdatum", "Leistungsdatum", "Kunde", "Kundennummer", "KundeUStIdNr", "Land", "Netto", "Umsatzsteuer", "Brutto", "Steuersatz", "Steuerhinweis", "Status", "BezahltAm"])
    );

    // Ausgaben + Belege
    const expenseRows = expenses.map((e) => {
      const net = Math.round(e.amountCents / (1 + e.vatRateBps / 10000));
      let receipt = "";
      if (e.receiptPath && fs.existsSync(e.receiptPath)) {
        receipt = `${e.date.toISOString().slice(0, 10)}_${safeName(e.vendor)}_${e.id.slice(0, 6)}${path.extname(e.receiptPath) || ".pdf"}`;
        fs.copyFileSync(e.receiptPath, path.join(root, "belege", receipt));
      }
      return {
        Datum: dateDe(e.date),
        Lieferant: e.vendor,
        Kategorie: e.category,
        Beschreibung: e.description ?? "",
        Brutto: eurDe(e.amountCents),
        Steuersatz: e.vatRateBps / 100,
        Netto: eurDe(net),
        Vorsteuer: eurDe(e.amountCents - net),
        Belegdatei: receipt ? `belege/${receipt}` : "",
      };
    });
    fs.writeFileSync(path.join(root, "ausgaben.csv"), csv(expenseRows, ["Datum", "Lieferant", "Kategorie", "Beschreibung", "Brutto", "Steuersatz", "Netto", "Vorsteuer", "Belegdatei"]));

    // Belegarchiv-Dokumente des Jahres (nach Belegdatum)
    if (archived.length > 0) {
      fs.mkdirSync(path.join(root, "archiv"), { recursive: true });
      const archiveRoot = path.resolve(env.UPLOAD_DIR);
      const archiveRows = archived.map((d) => {
        const abs = path.resolve(archiveRoot, d.filePath);
        let file = "";
        if (abs.startsWith(archiveRoot + path.sep) && fs.existsSync(abs)) {
          file = `${d.documentDate.toISOString().slice(0, 10)}_${safeName(d.title)}_${d.id.slice(0, 6)}${path.extname(d.filePath)}`;
          fs.copyFileSync(abs, path.join(root, "archiv", file));
        }
        return { Datum: dateDe(d.documentDate), Titel: d.title, Kategorie: d.category, Aussteller: d.vendor ?? "", Betrag: d.amountCents == null ? "" : eurDe(d.amountCents), Tags: d.tags.join(", "), Notizen: d.notes ?? "", Datei: file ? `archiv/${file}` : "" };
      });
      fs.writeFileSync(path.join(root, "archiv.csv"), csv(archiveRows, ["Datum", "Titel", "Kategorie", "Aussteller", "Betrag", "Tags", "Notizen", "Datei"]));
    }

    // Anlageverzeichnis: alle bis zum Jahresende angeschafften Güter mit AfA des Jahres und Restbuchwert
    const assets = await prisma.asset.findMany({ where: { companyId, purchaseDate: { lt: to } }, orderBy: { purchaseDate: "asc" } });
    if (assets.length > 0) {
      const assetRows = assets.map((a) => {
        const input = { purchaseDate: a.purchaseDate, costCents: a.costCents, method: a.method as "GWG" | "LINEAR", usefulLifeYears: a.usefulLifeYears };
        return {
          Bezeichnung: a.name,
          Anschaffung: dateDe(a.purchaseDate),
          Anschaffungskosten: eurDe(a.costCents),
          Methode: a.method === "GWG" ? "GWG (Sofortabzug)" : "linear",
          Nutzungsdauer_Jahre: a.usefulLifeYears ?? "",
          AfA_im_Jahr: eurDe(depreciationForYear(input, year)?.amountCents ?? 0),
          Restbuchwert_Jahresende: eurDe(bookValueAtYearEnd(input, year)),
          Notizen: a.notes ?? "",
        };
      });
      fs.writeFileSync(path.join(root, "anlagenverzeichnis.csv"), csv(assetRows, ["Bezeichnung", "Anschaffung", "Anschaffungskosten", "Methode", "Nutzungsdauer_Jahre", "AfA_im_Jahr", "Restbuchwert_Jahresende", "Notizen"]));
    }

    // Umsatzsteuer je Quartal + Jahr
    const vatRows: Record<string, unknown>[] = [];
    for (const period of ["q1", "q2", "q3", "q4", "year"]) {
      const p = parsePeriod({ year, period });
      const s = await computeVatSummary(companyId, p.from, p.to);
      for (const r of s.rows) vatRows.push({ Zeitraum: p.label, Position: r.label, Kennzahl: r.kz ?? "", Netto: eurDe(r.netCents), Umsatzsteuer: eurDe(r.vatCents) });
      vatRows.push({ Zeitraum: p.label, Position: "Abziehbare Vorsteuer aus Ausgaben", Kennzahl: "66", Netto: eurDe(s.expenseNetCents), Umsatzsteuer: eurDe(s.inputVatCents) });
      vatRows.push({ Zeitraum: p.label, Position: "Vorläufige Zahllast (+) / Erstattung (-)", Kennzahl: "", Netto: "", Umsatzsteuer: eurDe(s.payableCents) });
    }
    fs.writeFileSync(path.join(root, "umsatzsteuer-uebersicht.csv"), csv(vatRows, ["Zeitraum", "Position", "Kennzahl", "Netto", "Umsatzsteuer"]));

    // Rechnungs-PDFs
    for (const inv of invoices) {
      if (!inv.invoiceNumber) continue;
      const locale = (inv.company.defaultLocale === "en" ? "en" : "de") as "de" | "en";
      const pdf = await generateAndStoreInvoicePdf(inv, locale);
      fs.writeFileSync(path.join(root, "rechnungen", `${safeName(inv.invoiceNumber)}.pdf`), pdf);
    }

    fs.writeFileSync(
      path.join(root, "LIES-MICH.txt"),
      [
        `Steuerberater-Paket ${year} - ${company.name}`,
        `Erstellt am ${dateDe(new Date())}`,
        "",
        "einnahmen.csv              alle ausgestellten Rechnungen und Korrekturbelege (ohne Entwürfe), Semikolon-getrennt, Beträge mit Dezimalkomma",
        "ausgaben.csv               alle erfassten Ausgaben mit Vorsteuer und Verweis auf die Belegdatei",
        "umsatzsteuer-uebersicht.csv  Umsätze nach Steuersätzen/Befreiungen je Quartal und Jahr (Sollversteuerung, Rechnungsdatum)",
        "rechnungen/               Rechnungs-PDFs (PDF/A-3b, soweit eine Schrift eingebettet werden konnte)",
        "belege/                   hochgeladene Ausgabenbelege",
        "anlagenverzeichnis.csv    Anlagegüter mit Abschreibung (AfA) im Jahr und Restbuchwert; mit einer Anlage verknüpfte Ausgaben stehen in ausgaben.csv mit dem vollen Betrag, zählen in der EÜR aber nur als AfA",
        "archiv.csv, archiv/       Dokumente aus dem Belegarchiv mit Belegdatum im Jahr (Eingangsrechnungen, Quittungen, Verträge ...)",
        "",
        "Hinweise:",
        "- Dies ist KEIN DATEV-Buchungsstapel; Konten (SKR03/04) und Buchungsschlüssel ordnet die Kanzlei zu.",
        "- Die Umsatzsteuer-Übersicht ist eine Orientierungshilfe und ersetzt keine Voranmeldung. Bei Ist-Versteuerung weichen die Werte ab.",
        "- Korrekturbelege (Storno) mindern den Umsatz im Zeitraum ihres Rechnungsdatums, das Original bleibt in seinem Zeitraum stehen.",
      ].join("\r\n")
    );

    const zipPath = path.join(tmp, `steuerberater-${year}.zip`);
    await zip(root, zipPath);
    await writeAuditLog({ req, companyId, userId: req.auth!.sub, action: "accounting.package_export", entityType: "Company", entityId: companyId, metadata: { year, invoices: invoices.length, expenses: expenses.length } });
    res.on("finish", cleanup);
    res.on("close", cleanup);
    res.download(zipPath, `steuerberater-${year}.zip`);
  } catch (err) {
    cleanup();
    throw err;
  }
});
