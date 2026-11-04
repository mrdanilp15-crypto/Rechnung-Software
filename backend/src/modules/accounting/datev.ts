import { dayKey } from "../timetracking/calc";

/**
 * DATEV-Export (Buchungsstapel, Format "EXTF" Version 700 / Formatversion 12) für die Einnahmen-Überschuss-Rechnung: Einnahmen werden zum
 * Zahlungsdatum gebucht (Bank an Erlöse), Ausgaben zum Belegdatum (Aufwand an Bank). Die Kontenzuordnung sind Vorschläge für SKR03 und SKR04 und
 * lassen sich anpassen; der Steuerberater sollte einen Testimport machen. Es werden nur die ersten 14 Spalten des Formats geschrieben
 * (Umsatz bis Buchungstext), alles Weitere ist optional.
 */

export interface DatevSettings {
  skr: "03" | "04";
  consultantNumber: string;
  clientNumber: string;
  accountLength: number;
  bank: string;
  /** Erlöskonten */
  revenueSmallBusiness: string;
  revenue19: string;
  revenue7: string;
  /** steuerfrei / 0 % / Auslandsbezug */
  revenueTaxFree: string;
  /** Aufwandskonto je Ausgabenkategorie; unbekannte Kategorien gehen auf expenseDefault */
  expenseAccounts: Record<string, string>;
  expenseDefault: string;
}

export function defaultSettings(skr: "03" | "04"): DatevSettings {
  if (skr === "04") {
    return {
      skr, consultantNumber: "", clientNumber: "", accountLength: 4, bank: "1800",
      revenueSmallBusiness: "4180", revenue19: "4400", revenue7: "4300", revenueTaxFree: "4120",
      expenseAccounts: { Material: "5200", Software: "6495", Fahrtkosten: "6530", Miete: "6310", Werbung: "6600", Sonstiges: "6850" },
      expenseDefault: "6850",
    };
  }
  return {
    skr, consultantNumber: "", clientNumber: "", accountLength: 4, bank: "1200",
    revenueSmallBusiness: "8195", revenue19: "8400", revenue7: "8300", revenueTaxFree: "8120",
    expenseAccounts: { Material: "3200", Software: "4806", Fahrtkosten: "4530", Miete: "4210", Werbung: "4610", Sonstiges: "4980" },
    expenseDefault: "4980",
  };
}

export const isAccount = (v: string) => /^\d{4,8}$/.test(v);

export interface BookingLine {
  amountCents: number; // immer positiv
  side: "S" | "H"; // bezieht sich auf "account"
  account: string;
  counter: string;
  buKey: string; // "" = keiner
  date: Date;
  ref: string;
  text: string;
}

export interface InvoiceForBooking {
  invoiceNumber: string | null;
  customerName: string;
  paidAt: Date;
  totalCents: number;
  isSmallBusiness: boolean;
  vatNoticeKey: string | null;
  items: { vatRateBps: number; lineTotalCents: number }[];
}

export interface BookingResult {
  lines: BookingLine[];
  warnings: string[];
}

/** Einnahme: Bank (Soll) an Erlöse (Haben), getrennt nach Steuersatz. Der Betrag stimmt immer mit dem Rechnungsbrutto überein. */
export function buildInvoiceBookings(inv: InvoiceForBooking, s: DatevSettings): BookingResult {
  const ref = inv.invoiceNumber ?? "";
  const text = `${ref} ${inv.customerName}`.trim();
  const warnings: string[] = [];
  const base = { side: "S" as const, account: s.bank, date: inv.paidAt, ref, text };
  const sign = inv.totalCents < 0 ? -1 : 1;

  if (inv.isSmallBusiness) return { lines: [{ ...base, amountCents: Math.abs(inv.totalCents), counter: s.revenueSmallBusiness, buKey: "", side: sign > 0 ? "S" : "H" }], warnings };
  if (inv.vatNoticeKey) {
    warnings.push(`${ref}: Auslandsbezug oder steuerfrei - auf das Konto ${s.revenueTaxFree} gebucht, bitte mit dem Steuerberater prüfen.`);
    return { lines: [{ ...base, amountCents: Math.abs(inv.totalCents), counter: s.revenueTaxFree, buKey: "", side: sign > 0 ? "S" : "H" }], warnings };
  }

  // nach Steuersatz gruppieren: netto je Satz, Steuer gerundet, Rundungsdifferenz auf die größte Gruppe
  const groups = new Map<number, number>();
  for (const it of inv.items) groups.set(it.vatRateBps, (groups.get(it.vatRateBps) ?? 0) + it.lineTotalCents);
  const parts = [...groups.entries()].map(([rate, net]) => ({ rate, gross: net + Math.round((net * rate) / 10000) }));
  if (parts.length === 0) parts.push({ rate: 1900, gross: inv.totalCents });
  const diff = inv.totalCents - parts.reduce((a, p) => a + p.gross, 0);
  if (diff !== 0) parts.sort((a, b) => Math.abs(b.gross) - Math.abs(a.gross))[0].gross += diff;

  const lines = parts.map((p): BookingLine => {
    const known = p.rate === 1900 || p.rate === 700 || p.rate === 0;
    if (!known) warnings.push(`${ref}: Steuersatz ${p.rate / 100} % ist unüblich - auf das Konto für 19 % gebucht, bitte prüfen.`);
    const counter = p.rate === 700 ? s.revenue7 : p.rate === 0 ? s.revenueTaxFree : s.revenue19;
    const buKey = p.rate === 700 ? "2" : p.rate === 1900 ? "3" : "";
    return { ...base, amountCents: Math.abs(p.gross), counter, buKey, side: p.gross >= 0 ? "S" : "H" };
  });
  return { lines: lines.filter((l) => l.amountCents !== 0), warnings };
}

export interface ExpenseForBooking {
  date: Date;
  vendor: string;
  category: string;
  description: string | null;
  amountCents: number;
  vatRateBps: number;
}

/** Ausgabe: Aufwand (Soll) an Bank (Haben). Bei Kleinunternehmern ohne Vorsteuerabzug (Brutto ist der Aufwand), sonst mit Vorsteuerschlüssel. */
export function buildExpenseBooking(e: ExpenseForBooking, ref: string, s: DatevSettings, isSmallBusiness: boolean): BookingResult {
  const warnings: string[] = [];
  const account = s.expenseAccounts[e.category] ?? s.expenseDefault;
  if (!s.expenseAccounts[e.category]) warnings.push(`${ref}: Kategorie "${e.category}" hat kein eigenes Konto - auf ${s.expenseDefault} gebucht.`);
  let buKey = "";
  if (!isSmallBusiness) {
    if (e.vatRateBps === 1900) buKey = "9";
    else if (e.vatRateBps === 700) buKey = "8";
    else if (e.vatRateBps !== 0) warnings.push(`${ref}: Steuersatz ${e.vatRateBps / 100} % ist unüblich - ohne Vorsteuerschlüssel gebucht, bitte prüfen.`);
  }
  const text = [e.vendor, e.description].filter(Boolean).join(" ");
  return { lines: [{ amountCents: Math.abs(e.amountCents), side: e.amountCents >= 0 ? "S" : "H", account, counter: s.bank, buKey, date: e.date, ref, text }], warnings };
}

// ---------- Dateiformat ----------

const money = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");
const q = (v: string) => `"${v.replace(/"/g, '""')}"`;

/** Belegfeld 1: höchstens 36 Zeichen aus Großbuchstaben, Ziffern und $ & % * + - / sowie Leerzeichen */
export const belegfeld = (v: string) => v.toUpperCase().replace(/Ä/g, "AE").replace(/Ö/g, "OE").replace(/Ü/g, "UE").replace(/ß/g, "SS").replace(/[^A-Z0-9 $&%*+\-/]/g, "-").slice(0, 36);
/** Buchungstext: höchstens 60 Zeichen, ohne Strichpunkt, Anführungszeichen und Zeilenumbrüche */
export const buchungstext = (v: string) => v.replace(/[;"\r\n]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);

const ddmm = (d: Date) => {
  const k = dayKey(d); // JJJJ-MM-TT in deutscher Zeit
  return k.slice(8, 10) + k.slice(5, 7);
};

const COLUMNS = ["Umsatz (ohne Soll/Haben-Kz)", "Soll/Haben-Kennzeichen", "WKZ Umsatz", "Kurs", "Basis-Umsatz", "WKZ Basis-Umsatz", "Konto", "Gegenkonto (ohne BU-Schlüssel)", "BU-Schlüssel", "Belegdatum", "Belegfeld 1", "Belegfeld 2", "Skonto", "Buchungstext"];

const stamp = (d: Date) => {
  const p = (n: number, l = 2) => String(n).padStart(l, "0");
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}${p(d.getUTCMilliseconds(), 3)}`;
};
const ymd = (d: Date) => dayKey(d).replace(/-/g, "");

export function buildDatevText(lines: BookingLine[], s: DatevSettings, range: { from: Date; to: Date }, label: string, now: Date = new Date()): string {
  const header = [
    q("EXTF"), 700, 21, q("Buchungsstapel"), 12, stamp(now), "", q("RE"), q(""), q(""),
    s.consultantNumber, s.clientNumber, ymd(new Date(range.from.getTime() + 86_400_000 * 2)).slice(0, 4) + "0101", s.accountLength, ymd(range.from), ymd(new Date(range.to.getTime() - 1)),
    q(buchungstext(`Rechnungssoftware ${label}`)), q(""), 1, 0, 0, q("EUR"), "", q(""), "", "", q(s.skr), "", "", q(""), q(""),
  ].join(";");
  const rows = lines.map((l) =>
    [money(l.amountCents), q(l.side), q("EUR"), "", "", "", l.account, l.counter, l.buKey ? q(l.buKey) : "", ddmm(l.date), q(belegfeld(l.ref)), "", "", q(buchungstext(l.text))].join(";"),
  );
  return [header, COLUMNS.join(";"), ...rows].join("\r\n") + "\r\n";
}

/** DATEV erwartet Windows-1252; für deutsche Texte entspricht das Latin-1. Zeichen außerhalb davon werden ersetzt. */
export function toAnsi(text: string): Buffer {
  const mapped = text.replace(/€/g, "EUR").replace(/[–—]/g, "-").replace(/[„“”]/g, '"').replace(/[‚‘’]/g, "'");
  const bytes = Buffer.alloc(mapped.length);
  for (let i = 0; i < mapped.length; i++) {
    const c = mapped.charCodeAt(i);
    bytes[i] = c <= 0xff ? c : 0x3f; // ?
  }
  return bytes;
}
