import { parseMoneyToCents } from "../orderImport/etsy";

/**
 * Wertet den Text eines Belegs (Ergebnis der Texterkennung im Browser oder die Textebene eines PDFs) aus und schlägt Datum,
 * Händler, Bruttobetrag, MwSt-Satz, Belegnummer und Kategorie vor. Nichts wird geraten, was nicht im Text steht: Jeder
 * Vorschlag hat eine Sicherheit (high/medium/low) und eine Liste von Alternativen, damit der Nutzer in der Maske nachbessern kann.
 * Texterkennung macht Fehler (O statt 0, vertauschte Zeilen) - deshalb wird nie automatisch gebucht.
 */

export type Confidence = "high" | "medium" | "low";

export interface AmountCandidate {
  cents: number;
  line: string;
  score: number;
}
export interface DateCandidate {
  date: string; // YYYY-MM-DD
  line: string;
  score: number;
}
export interface VendorCandidate {
  name: string;
  score: number;
  source: "bekannt" | "firma" | "web" | "kopfzeile";
}

export interface ReceiptSuggestion {
  amountCents: number | null;
  amountConfidence: Confidence;
  amountCandidates: AmountCandidate[];
  date: string | null;
  dateConfidence: Confidence;
  dateCandidates: DateCandidate[];
  vendor: string | null;
  vendorConfidence: Confidence;
  vendorCandidates: VendorCandidate[];
  vatRateBps: number | null;
  vatConfidence: Confidence;
  netCents: number | null;
  vatCents: number | null;
  invoiceNumber: string | null;
  category: string | null;
  categorySource: "keywords" | null;
  warnings: string[];
  /** Zeilen des Belegs mit den darin gefundenen Beträgen/Daten - damit man in der Maske eine Zeile antippen und übernehmen kann */
  lines: { text: string; amounts: number[]; dates: string[] }[];
}

export interface ParseContext {
  knownVendors?: string[];
  today?: Date;
}

export const CATEGORIES = ["Material", "Software", "Fahrtkosten", "Miete", "Werbung", "Sonstiges"] as const;

// Stichwörter je Kategorie (Kleinschreibung). Nur Vorschlag - bei bekannten Händlern gilt stattdessen die bisherige Kategorie.
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  Material: ["filament", "pla", "petg", "abs", "asa", "tpu", "harz", "resin", "rohmaterial", "farbe", "lack", "kleber", "schrauben", "karton", "verpackung", "versandtasche", "polybeutel", "holz", "baumarkt", "bauhaus", "obi", "hornbach", "düse", "druckplatte", "sandpapier"],
  Software: ["software", "lizenz", "abonnement", "subscription", "cloud", "hosting", "domain", "adobe", "github", "microsoft", "google workspace", "dropbox", "app store", "saas", "server"],
  Fahrtkosten: ["tankstelle", "super e10", "super e5", "diesel", "benzin", "kraftstoff", "parkhaus", "parkgebühr", "parken", "deutsche bahn", "fahrkarte", "ticket", "taxi", "aral", "shell", "esso", "jet tankstelle", "maut"],
  Miete: ["miete", "pacht", "nebenkosten", "raummiete", "stellplatz"],
  Werbung: ["werbung", "google ads", "facebook", "meta ads", "instagram", "flyer", "visitenkarten", "druckerei", "anzeige", "marketing", "etsy ads", "messe"],
};

const MONTHS: Record<string, number> = {
  januar: 1, jan: 1, februar: 2, feb: 2, märz: 3, maerz: 3, mär: 3, mrz: 3, april: 4, apr: 4, mai: 5, juni: 6, jun: 6, juli: 7, jul: 7,
  august: 8, aug: 8, september: 9, sep: 9, sept: 9, oktober: 10, okt: 10, november: 11, nov: 11, dezember: 12, dez: 12,
};

/** OCR verwechselt gern O und 0 - nur an Ziffern grenzende Buchstaben O werden zu 0 (für Beträge und Daten, nicht für den Anzeigetext). */
function fixDigits(line: string): string {
  return line.replace(/(?<=\d)[Oo]|[Oo](?=\d)/g, "0");
}

function lines(text: string): string[] {
  return text
    .replace(/\r/g, "")
    .split("\n")
    .map((l) => l.replace(/[ \t]+/g, " ").trim())
    .filter((l) => l.length > 0);
}

const MONEY_RE = /(?<![\d.,])-?\d{1,3}(?:[. ]\d{3})*[,.]\d{2}(?![\d])(?![.,]\d)|(?<![\d.,])-?\d+[,.]\d{2}(?![\d])(?![.,]\d)/g;

export function extractAmounts(line: string): number[] {
  const out: number[] = [];
  const fixed = fixDigits(line);
  // Uhrzeiten wie "14.35" sehen aus wie Beträge mit Punkt - auf Zeilen mit Datum oder "Uhr" zählen nur Beträge mit Komma
  const timeLike = /\d{1,2}[.\-/]\d{1,2}[.\-/]\d{2,4}|\buhr\b/i.test(fixed);
  for (const m of fixed.matchAll(MONEY_RE)) {
    if (timeLike && !m[0].includes(",")) continue;
    const cents = parseMoneyToCents(m[0].replace(/ /g, ""));
    if (cents > 0 && cents < 100_000_000) out.push(cents);
  }
  return out;
}

function validYmd(y: number, m: number, d: number, today: Date): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  if (y < 2000 || y > today.getFullYear() + 1) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function extractDates(line: string, today = new Date()): string[] {
  const s = fixDigits(line);
  const out: string[] = [];
  for (const m of s.matchAll(/(?<!\d)(\d{1,2})\s?[.\-/]\s?(\d{1,2})\s?[.\-/]\s?(\d{4}|\d{2})(?!\d)/g)) {
    const yy = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    const ymd = validYmd(yy, Number(m[2]), Number(m[1]), today);
    if (ymd) out.push(ymd);
  }
  for (const m of s.matchAll(/(?<!\d)(\d{4})-(\d{2})-(\d{2})(?!\d)/g)) {
    const ymd = validYmd(Number(m[1]), Number(m[2]), Number(m[3]), today);
    if (ymd) out.push(ymd);
  }
  for (const m of s.matchAll(/(?<!\d)(\d{1,2})\.?\s*([A-Za-zäöüÄÖÜ]{3,9})\.?,?\s*(\d{4})(?!\d)/g)) {
    const month = MONTHS[m[2].toLowerCase()];
    if (!month) continue;
    const ymd = validYmd(Number(m[3]), month, Number(m[1]), today);
    if (ymd) out.push(ymd);
  }
  return out;
}

function totalLineScore(lower: string): number {
  let score = 0;
  const has = (...words: string[]) => words.some((w) => lower.includes(w));
  if (has("gesamtbetrag", "gesamtsumme", "rechnungsbetrag", "endbetrag", "endsumme", "zu zahlen", "zahlbetrag", "grand total", "invoice total", "amount due", "total due", "summe brutto", "gesamt brutto", "brutto gesamt")) score += 12;
  else if (has("total", "gesamt", "summe")) score += 8;
  if (has("brutto")) score += 4;
  if (has("betrag")) score += 3;
  if (has("ec-karte", "ec karte", "girocard", "kartenzahlung", "visa", "mastercard", "paypal", "karte")) score += 4;
  if (/\bbar\b/.test(lower)) score += 2;
  if (has("zahlung")) score += 2;
  if (has("netto", "zwischensumme", "zwischen-summe", "subtotal", "rückgeld", "rueckgeld", "zurück", "gegeben", "wechselgeld", "change", "versand", "porto")) score -= 12;
  if (has("mwst", "ust", "umsatzsteuer", "mehrwertsteuer", "steuer", "vat", "tax") && !has("gesamt", "brutto", "summe", "total")) score -= 5;
  return score;
}

function dateLineScore(lower: string): number {
  let score = 0;
  if (/rechnungsdatum|belegdatum|datum|date|ausstellungsdatum|bestelldatum/.test(lower)) score += 8;
  if (/leistungsdatum|lieferdatum/.test(lower)) score += 2;
  if (/fällig|faellig|zahlbar bis|zahlungsziel|due|spätestens|bis zum|gültig/.test(lower)) score -= 10;
  return score;
}

function pickRate(text: string, ls: string[]): { bps: number | null; mixed: boolean } {
  const counts: Record<number, number> = {};
  for (const l of ls) {
    const lower = l.toLowerCase();
    const taxy = /mwst|ust|umsatzsteuer|mehrwertsteuer|steuer|vat|tax/.test(lower) ? 3 : 1;
    for (const m of fixDigits(l).matchAll(/(?<![\d.,])(\d{1,2})(?:[.,]0+)?\s*%/g)) {
      const rate = Number(m[1]);
      if (rate === 19 || rate === 7) counts[rate * 100] = (counts[rate * 100] ?? 0) + taxy;
    }
  }
  const rates = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  if (rates.length === 0) {
    if (/steuerfrei|kleinunternehmer|§\s?19\s?ustg|nicht steuerbar/i.test(text)) return { bps: 0, mixed: false };
    return { bps: null, mixed: false };
  }
  return { bps: Number(rates[0][0]), mixed: rates.length > 1 };
}

function guessVendors(ls: string[], knownVendors: string[], fullLower: string): VendorCandidate[] {
  const out = new Map<string, VendorCandidate>();
  const add = (name: string, score: number, source: VendorCandidate["source"]) => {
    const clean = name.replace(/[|_~=<>{}\\]/g, " ").replace(/\s+/g, " ").trim().replace(/^[^A-Za-zÄÖÜäöü0-9]+|[^A-Za-zÄÖÜäöü0-9.)&]+$/g, "");
    if (clean.length < 3 || clean.length > 60) return;
    const key = clean.toLowerCase();
    const prev = out.get(key);
    if (!prev || prev.score < score) out.set(key, { name: clean, score, source });
  };

  for (const known of knownVendors) {
    if (known.trim().length >= 3 && fullLower.includes(known.trim().toLowerCase())) add(known.trim(), 100, "bekannt");
  }
  const skip = /rechnung|beleg|kassenbon|quittung|bon\b|datum|tel\.?|telefon|fax|e-?mail|www\.|http|@|straße|strasse|str\.|\b\d{5}\b|kunde|iban|bic|ust-?id|steuer|seite|page|invoice|order|bestell/i;
  ls.forEach((l, idx) => {
    if (/\b(gmbh|ug|e\.?\s?k\.?|ag|kg|gbr|ohg|mbh|ltd|inc|co\.)\b/i.test(l) && !/\d{5}/.test(l) && l.length <= 70) {
      add(l.replace(/\s*[-–|,]\s*(?:[A-ZÄÖÜ][\wäöüß.]+\s?)*\d.*$/, ""), 60 - Math.min(idx, 20), "firma");
    }
    if (idx < 8 && !skip.test(l) && extractAmounts(l).length === 0 && totalLineScore(l.toLowerCase()) <= 0) {
      const letters = (l.match(/[A-Za-zÄÖÜäöüß]/g) ?? []).length;
      if (letters >= 3 && letters / l.length >= 0.6) add(l, 30 - idx * 2, "kopfzeile");
    }
  });
  const domain = fullLower.match(/(?:www\.)?([a-z0-9-]{3,})\.(?:de|com|net|eu|shop|at|ch)\b/);
  if (domain && !/gmail|web|gmx|outlook|t-online|yahoo/.test(domain[1])) add(domain[1].charAt(0).toUpperCase() + domain[1].slice(1), 18, "web");
  return [...out.values()].sort((a, b) => b.score - a.score).slice(0, 5);
}

export function guessCategory(fullLower: string): string | null {
  let best: { cat: string; hits: number } | null = null;
  for (const [cat, words] of Object.entries(CATEGORY_KEYWORDS)) {
    const hits = words.filter((w) => new RegExp(`(?<![a-zäöüß])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(fullLower)).length;
    if (hits > 0 && (!best || hits > best.hits)) best = { cat, hits };
  }
  return best?.cat ?? null;
}

export function parseReceiptText(text: string, ctx: ParseContext = {}): ReceiptSuggestion {
  const today = ctx.today ?? new Date();
  const ls = lines(text);
  const fullLower = ls.join("\n").toLowerCase();
  const warnings: string[] = [];

  // --- Beträge ---
  const amounts: AmountCandidate[] = [];
  ls.forEach((l, idx) => {
    const found = extractAmounts(l);
    if (found.length === 0) return;
    let score = totalLineScore(l.toLowerCase());
    // Tabellenlayout: Stichwort in der Zeile davor, Betrag in der nächsten Zeile
    if (idx > 0 && extractAmounts(ls[idx - 1]).length === 0) score = Math.max(score, totalLineScore(ls[idx - 1].toLowerCase()) - 1);
    score += (idx / ls.length) * 2; // Summen stehen meist weiter unten
    for (const cents of found) amounts.push({ cents, line: l, score });
  });
  amounts.sort((a, b) => b.score - a.score || b.cents - a.cents);
  const uniqueAmounts: AmountCandidate[] = [];
  for (const a of amounts) if (!uniqueAmounts.some((u) => u.cents === a.cents)) uniqueAmounts.push(a);

  let gross: AmountCandidate | null = uniqueAmounts[0] ?? null;
  let amountConfidence: Confidence = !gross ? "low" : gross.score >= 8 ? "high" : gross.score >= 2 ? "medium" : "low";
  // Bei gleich gutem Stichwort gewinnt der größte Betrag (Brutto statt Netto/Teilbetrag)
  if (gross) {
    const tied = uniqueAmounts.filter((a) => Math.abs(a.score - gross!.score) < 2.1 && a.score >= 8);
    if (tied.length > 1) gross = tied.sort((a, b) => b.cents - a.cents)[0];
  }

  // --- Steuer: Satz aus Prozentangaben, Gegenprobe über Netto + Steuer = Brutto ---
  const rate = pickRate(text, ls);
  let vatRateBps = rate.bps;
  let vatConfidence: Confidence = rate.bps !== null ? "medium" : "low";
  let netCents: number | null = null;
  let vatCents: number | null = null;
  if (gross) {
    const cents = uniqueAmounts.map((a) => a.cents);
    outer: for (const n of cents) {
      for (const v of cents) {
        if (n >= gross.cents || v >= n || Math.abs(n + v - gross.cents) > 1) continue;
        const ratio = v / n;
        const match = [1900, 700].find((bps) => Math.abs(ratio - bps / 10000) < 0.012);
        if (match) {
          netCents = n;
          vatCents = v;
          vatRateBps = match;
          vatConfidence = "high";
          amountConfidence = amountConfidence === "low" ? "medium" : "high";
          break outer;
        }
      }
    }
  }
  if (rate.mixed && vatConfidence !== "high") warnings.push("Mehrere Steuersätze (7 % und 19 %) erkannt - eine Ausgabe hat nur einen Satz. Bitte den überwiegenden Satz wählen oder die Ausgabe aufteilen.");
  if (vatRateBps !== null && netCents === null && gross) {
    netCents = Math.round(gross.cents / (1 + vatRateBps / 10000));
    vatCents = gross.cents - netCents;
  }
  if (vatRateBps === null) warnings.push("Steuersatz nicht erkannt - bitte prüfen (19 % ist voreingestellt).");

  // --- Datum ---
  const dates: DateCandidate[] = [];
  ls.forEach((l, idx) => {
    for (const d of extractDates(l, today)) {
      let score = dateLineScore(l.toLowerCase());
      if (idx > 0) score = Math.max(score, dateLineScore(ls[idx - 1].toLowerCase()) - 1);
      score -= idx * 0.05;
      dates.push({ date: d, line: l, score });
    }
  });
  dates.sort((a, b) => b.score - a.score);
  const uniqueDates: DateCandidate[] = [];
  for (const d of dates) if (!uniqueDates.some((u) => u.date === d.date)) uniqueDates.push(d);
  const bestDate = uniqueDates[0] ?? null;
  const dateConfidence: Confidence = !bestDate ? "low" : bestDate.score >= 6 || uniqueDates.length === 1 ? "high" : "medium";
  if (bestDate && bestDate.date > today.toISOString().slice(0, 10)) warnings.push("Das erkannte Datum liegt in der Zukunft - bitte prüfen.");

  // --- Händler ---
  const vendors = guessVendors(ls, ctx.knownVendors ?? [], fullLower);
  const vendorConfidence: Confidence = !vendors[0] ? "low" : vendors[0].source === "bekannt" ? "high" : vendors[0].source === "firma" ? "medium" : "low";

  // --- Belegnummer ---
  const numMatch = text.match(/(?:rechnungs?-?\s?(?:nr|nummer)|beleg-?\s?(?:nr|nummer)|invoice\s?(?:no|number|#)|bon-?\s?nr|re-?\s?nr|bestell-?\s?(?:nr|nummer)|order\s?(?:no|number|#))\.?\s*[:#]?\s*([A-Za-z0-9][A-Za-z0-9\-/_.]{2,24})/i);
  const invoiceNumber = numMatch ? numMatch[1].replace(/[.]+$/, "") : null;

  if (/(?:\$|usd|gbp|£|chf)/i.test(text) && !/€|eur/i.test(text)) warnings.push("Der Beleg scheint nicht in Euro zu sein - bitte Betrag prüfen.");
  if (ls.length < 3) warnings.push("Es wurde fast kein Text erkannt - Foto gerade, hell und scharf aufnehmen oder mit Drehen erneut versuchen.");

  const category = guessCategory(fullLower);
  return {
    amountCents: gross?.cents ?? null,
    amountConfidence,
    amountCandidates: uniqueAmounts.slice(0, 8),
    date: bestDate?.date ?? null,
    dateConfidence,
    dateCandidates: uniqueDates.slice(0, 5),
    vendor: vendors[0]?.name ?? null,
    vendorConfidence,
    vendorCandidates: vendors,
    vatRateBps,
    vatConfidence,
    netCents,
    vatCents,
    invoiceNumber,
    category,
    categorySource: category ? "keywords" : null,
    warnings,
    lines: ls.slice(0, 150).map((text) => ({ text, amounts: extractAmounts(text), dates: extractDates(text, today) })),
  };
}
