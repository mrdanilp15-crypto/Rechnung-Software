/**
 * Zahlungseingänge offenen Rechnungen zuordnen. Automatisch nur bei eindeutigem Treffer (Betrag UND Rechnungsnummer im Verwendungszweck);
 * sonst werden Vorschläge mit Begründung gemacht, die der Nutzer mit einem Klick bestätigt. Reine Logik ohne Datenbankzugriff.
 */

export interface OpenInvoice {
  id: string;
  number: string | null;
  totalCents: number;
  customer: string;
}

export interface Suggestion {
  invoiceId: string;
  number: string | null;
  customer: string;
  totalCents: number;
  /** Betrag der Zahlung minus Rechnungsbetrag (0 = passt genau) */
  diffCents: number;
  reason: string;
  score: number;
}

const alnum = (s: string) => s.toLowerCase().replace(/[^a-z0-9äöüß]/g, "");

/** Steht die Rechnungsnummer im Text? Ohne Rücksicht auf Trenner und Groß-/Kleinschreibung ("RE-2026-0007" findet "RE20260007"). */
export function numberInPurpose(number: string | null, purpose: string): boolean {
  if (!number) return false;
  const n = alnum(number);
  return n.length >= 4 && alnum(purpose).includes(n);
}

const STOP = new Set(["gmbh", "ag", "kg", "ug", "ohg", "gbr", "mbh", "co", "eg", "ev", "herr", "frau", "und", "the", "inh", "inhaber", "e", "k"]);
const tokens = (s: string) => s.toLowerCase().split(/[^a-zäöüß0-9]+/).filter((t) => t.length >= 3 && !STOP.has(t));

/** 2 = alle Namensteile des Kunden kommen beim Zahlenden vor, 1 = mindestens ein Teil (ab 4 Zeichen), 0 = nichts. */
export function nameMatch(customer: string, counterparty: string): 0 | 1 | 2 {
  const c = tokens(customer);
  const p = new Set(tokens(counterparty));
  if (c.length === 0 || p.size === 0) return 0;
  const hits = c.filter((t) => p.has(t));
  if (hits.length === c.length) return 2;
  return hits.some((t) => t.length >= 4) ? 1 : 0;
}

export function suggestMatches(tx: { amountCents: number; purpose: string; counterparty: string }, invoices: OpenInvoice[]): Suggestion[] {
  if (tx.amountCents <= 0) return [];
  const sameAmount = invoices.filter((i) => i.totalCents === tx.amountCents);
  const out: Suggestion[] = [];
  for (const inv of invoices) {
    let score = 0;
    const reasons: string[] = [];
    if (numberInPurpose(inv.number, tx.purpose)) {
      score += 100;
      reasons.push("Rechnungsnummer im Verwendungszweck");
    }
    if (inv.totalCents === tx.amountCents) {
      score += 50;
      reasons.push("Betrag stimmt");
    } else if (tx.amountCents < inv.totalCents && tx.amountCents >= inv.totalCents * 0.95) {
      score += 15;
      reasons.push("Betrag etwas niedriger (Skonto?)");
    }
    const nm = nameMatch(inv.customer, tx.counterparty);
    if (nm === 2) {
      score += 40;
      reasons.push("Name passt");
    } else if (nm === 1) {
      score += 20;
      reasons.push("Name teilweise gleich");
    }
    if (inv.totalCents === tx.amountCents && sameAmount.length === 1 && score < 90) {
      score += 10;
      reasons.push("einzige Rechnung mit diesem Betrag");
    }
    if (score >= 50) out.push({ invoiceId: inv.id, number: inv.number, customer: inv.customer, totalCents: inv.totalCents, diffCents: tx.amountCents - inv.totalCents, reason: reasons.join(", "), score });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 3);
}

/** Eindeutiger Treffer für die automatische Zuordnung beim Import: Betrag gleich und Rechnungsnummer im Zweck, genau eine Rechnung. */
export function autoMatch(tx: { amountCents: number; purpose: string }, invoices: OpenInvoice[]): OpenInvoice | undefined {
  if (tx.amountCents <= 0) return undefined;
  const hits = invoices.filter((i) => i.totalCents === tx.amountCents && numberInPurpose(i.number, tx.purpose));
  return hits.length === 1 ? hits[0] : undefined;
}
