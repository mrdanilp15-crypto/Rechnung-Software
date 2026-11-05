/**
 * Einen bestehenden Auftrag nachträglich mit einem Angebot verknüpfen (z.B. wenn der Auftrag separat angelegt wurde). Reine Prüflogik ohne
 * Datenbankzugriff (testbar); router.ts holt die Daten und schreibt die Verknüpfung.
 */

export interface LinkOrder {
  customerId: string;
  sourceQuoteId: string | null;
  voided: boolean;
}

export interface LinkQuote {
  customerId: string;
  status: string;
  /** Gibt es schon einen anderen (nicht ungültigen) Auftrag aus diesem Angebot? */
  alreadyHasOrder: boolean;
}

export function checkQuoteLink(order: LinkOrder, quote: LinkQuote): { ok: true; markAccepted: boolean } | { ok: false; status: number; error: string } {
  if (order.voided) return { ok: false, status: 409, error: "Dieser Auftrag ist ungültig." };
  if (order.sourceQuoteId) return { ok: false, status: 409, error: "Dieser Auftrag ist schon mit einem Angebot verknüpft." };
  if (order.customerId !== quote.customerId) return { ok: false, status: 400, error: "Angebot und Auftrag gehören zu verschiedenen Kunden." };
  if (quote.status === "DRAFT") return { ok: false, status: 400, error: "Das Angebot ist noch ein Entwurf. Bitte erst fertigstellen." };
  if (quote.status === "DECLINED") return { ok: false, status: 400, error: "Das Angebot wurde abgelehnt." };
  if (quote.alreadyHasOrder) return { ok: false, status: 409, error: "Aus diesem Angebot gibt es schon einen Auftrag." };
  // Ein Auftrag bedeutet: das Angebot wurde angenommen
  return { ok: true, markAccepted: quote.status === "SENT" || quote.status === "EXPIRED" };
}
