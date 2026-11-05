/**
 * Kontoauszug-CSV einlesen: unterschiedliche Spaltennamen der Banken (Sparkasse, Volksbank, ING, DKB ...), deutsches und ISO-Datum,
 * deutsches und englisches Zahlenformat. Reine Logik ohne Datenbankzugriff.
 */

/**
 * Geldbetrag im deutschen ("1.234,56") oder ISO-/englischen Format ("1234.56"). Mit Komma gilt es als Dezimaltrenner (Punkte davor sind
 * Tausender), ohne Komma der Punkt. Währungszeichen und Leerzeichen werden entfernt.
 */
export function parseAmount(raw: string): number {
  const t = raw.replace(/[€\s ]|EUR/gi, "").trim();
  if (!t) return NaN;
  if (t.includes(",")) return parseFloat(t.replace(/\./g, "").replace(",", "."));
  return parseFloat(t);
}

/** Datum als TT.MM.JJJJ, TT.MM.JJ oder JJJJ-MM-TT (auch mit Uhrzeit). Ergebnis: Mittag UTC (kein Tagessprung durch Zeitzonen) oder null. */
export function parseBookingDate(raw: string): Date | null {
  const t = raw.trim();
  let y: number, m: number, d: number;
  let r = /^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\D.*)?$/.exec(t);
  if (r) {
    d = +r[1]; m = +r[2]; y = +r[3];
  } else if ((r = /^(\d{1,2})\.(\d{1,2})\.(\d{2})$/.exec(t))) {
    d = +r[1]; m = +r[2]; y = 2000 + +r[3];
  } else if ((r = /^(\d{4})-(\d{2})-(\d{2})(?:\D.*)?$/.exec(t))) {
    y = +r[1]; m = +r[2]; d = +r[3];
  } else {
    return null;
  }
  const date = new Date(Date.UTC(y, m - 1, d, 12));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d ? date : null;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9äöüß]/g, "");

const DATE_KEYS = ["bookingdate", "buchungstag", "buchungsdatum", "buchungsdatum", "datum", "date", "valuta", "valutadatum", "bokningsdatum"];
const AMOUNT_KEYS = ["amount", "betrag", "betrageur", "umsatz", "betragindeur", "soll/haben"];
const PURPOSE_KEYS = ["purpose", "verwendungszweck", "buchungstext", "zweck", "beschreibung", "details"];
const PARTY_KEYS = ["counterparty", "zahlungspflichtiger", "empfaenger", "empfänger", "beguenstigter/zahlungspflichtiger", "begünstigter/zahlungspflichtiger", "beguenstigterzahlungspflichtiger", "begünstigterzahlungspflichtiger", "auftraggeber/empfänger", "auftraggeberempfänger", "name", "zahlungsbeteiligter", "name zahlungsbeteiligter"];

/** Erste passende Spalte nach der Reihenfolge der Schlüsselliste (bevorzugte Namen zuerst), nicht nach der Reihenfolge in der Datei. */
function pick(row: Record<string, string>, keys: string[]): string {
  const entries = Object.entries(row).map(([k, v]) => [norm(k), v] as const);
  for (const key of keys.map(norm)) {
    const hit = entries.find(([k, v]) => k === key && v !== undefined && String(v).trim() !== "");
    if (hit) return String(hit[1]);
  }
  return "";
}

export type ParsedRow = { ok: true; date: Date; amountCents: number; purpose: string; counterparty: string } | { ok: false; error: string };

export function parseBankRow(row: Record<string, string>): ParsedRow {
  const rawDate = pick(row, DATE_KEYS);
  const rawAmount = pick(row, AMOUNT_KEYS);
  if (!rawDate || !rawAmount) return { ok: false, error: "Buchungstag oder Betrag fehlt" };
  const date = parseBookingDate(rawDate);
  if (!date) return { ok: false, error: `Datum "${rawDate}" nicht lesbar (erwartet TT.MM.JJJJ oder JJJJ-MM-TT)` };
  const amount = parseAmount(rawAmount);
  if (Number.isNaN(amount)) return { ok: false, error: `Betrag "${rawAmount}" nicht lesbar` };
  return { ok: true, date, amountCents: Math.round(amount * 100), purpose: pick(row, PURPOSE_KEYS), counterparty: pick(row, PARTY_KEYS) };
}

/** Schlüssel zum Erkennen schon importierter Buchungen (Datum, Betrag, Zweck, Gegenseite) - damit ein zweiter Import derselben Datei nichts doppelt anlegt. */
export function bankFingerprint(date: Date, amountCents: number, purpose: string, counterparty: string): string {
  return [date.toISOString().slice(0, 10), amountCents, norm(purpose), norm(counterparty)].join("|");
}
