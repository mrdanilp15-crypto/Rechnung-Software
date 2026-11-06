import { api } from "../api/client";

/**
 * "Rechnung gleich fertigstellen": aus Auftrag oder Angebot die Rechnung anlegen, fertigstellen (Rechnungsnummer wird vergeben) und danach
 * auf der Rechnungsseite mit geöffnetem E-Mail-Formular weitermachen - alles mit einem Klick statt Entwurf prüfen -> Fertigstellen -> Senden.
 * Der Entwurf-Weg (prüfen und ändern vor dem Fertigstellen) bleibt daneben bestehen.
 */
export const QUICK_INVOICE_CONFIRM =
  "Rechnung jetzt fertigstellen?\n\nAlle Positionen werden übernommen und die fortlaufende Rechnungsnummer wird vergeben. Danach ist die Rechnung nicht mehr änderbar (Korrekturen nur per Storno). Im nächsten Schritt kannst du sie direkt per E-Mail senden.\n\nWillst du die Rechnung vorher prüfen oder ändern, brich ab und nimm \"→ Rechnung\" (Entwurf).";

export type QuickInvoiceResult = { path: string; message: string; ok: boolean };

/** base: "/order-confirmations" oder "/quotes". Gibt den Pfad zurück, zu dem navigiert werden soll. */
export async function createFinalInvoice(base: "/order-confirmations" | "/quotes", id: string): Promise<QuickInvoiceResult> {
  const { data } = await api.post(`${base}/${id}/convert-to-invoice`);
  try {
    await api.post(`/invoices/${data.id}/send`);
  } catch (e: any) {
    // Entwurf ist angelegt, Fertigstellen hat nicht geklappt: im Editor weitermachen
    return { ok: false, path: `/invoices/${data.id}/edit`, message: e?.response?.data?.error ?? "Rechnung als Entwurf angelegt, Fertigstellen hat nicht geklappt" };
  }
  return { ok: true, path: `/invoices/${data.id}?send=1`, message: "Rechnung fertiggestellt - jetzt per E-Mail senden" };
}
