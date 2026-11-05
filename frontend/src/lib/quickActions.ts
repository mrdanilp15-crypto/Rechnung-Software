/**
 * Schnellaktionen: eine Liste für das "+ Neu"-Menü oben und für die Suche (Strg K), damit alles mit wenigen Tasten erreichbar ist
 * und nichts nur über Umwege zu finden ist.
 */

export interface QuickAction {
  id: string;
  label: string;
  path: string;
  /** Zusätzliche Suchwörter (klein geschrieben) */
  keywords: string;
  /** "new" erscheint im "+ Neu"-Menü */
  group: "new" | "go";
  adminOnly?: boolean;
}

export const QUICK_ACTIONS: QuickAction[] = [
  { id: "new-invoice", label: "Neue Rechnung", path: "/invoices/new", keywords: "rechnung erstellen schreiben", group: "new" },
  { id: "new-quote", label: "Neues Angebot", path: "/quotes/new", keywords: "angebot erstellen kostenvoranschlag", group: "new" },
  { id: "new-order", label: "Neuer Auftrag (Auftragsbestätigung)", path: "/order-confirmations/new", keywords: "auftrag bestätigung bestellung", group: "new" },
  { id: "new-delivery", label: "Neuer Lieferschein", path: "/delivery-notes/new", keywords: "lieferschein", group: "new" },
  { id: "new-customer", label: "Neuer Kunde", path: "/customers?new=1", keywords: "kunde anlegen adresse", group: "new" },
  { id: "new-product", label: "Neues Produkt", path: "/catalog?tab=products&new=1", keywords: "produkt artikel anlegen kalkulation", group: "new" },
  { id: "new-material", label: "Neues Material / Filament", path: "/catalog?tab=materials&new=1", keywords: "material filament spule anlegen", group: "new" },
  { id: "new-expense", label: "Neue Ausgabe / Beleg erfassen", path: "/finance?tab=expenses", keywords: "ausgabe kosten einkauf quittung beleg", group: "new" },
  { id: "go-print", label: "Druck starten", path: "/catalog?tab=printers", keywords: "drucken senden drucker bambu", group: "go" },
  { id: "go-time", label: "Zeit erfassen", path: "/time", keywords: "arbeitszeit stunden timer", group: "go" },
  { id: "go-upload", label: "Datei ins Archiv hochladen", path: "/archive", keywords: "archiv hochladen 3mf datei upload", group: "go" },
  { id: "go-recurring", label: "Wiederkehrende Rechnungen", path: "/recurring", keywords: "abo wiederkehrend serie", group: "go" },
  { id: "go-import", label: "Bestellungen importieren (Etsy)", path: "/production", keywords: "etsy import bestellungen shop csv", group: "go" },
  { id: "go-dunning", label: "Mahnwesen einstellen", path: "/settings?tab=dunning", keywords: "mahnung erinnerung mahnwesen", group: "go", adminOnly: true },
  { id: "go-connections", label: "Verbindungen prüfen (E-Mail, Drucker, Backup)", path: "/settings?tab=verbindungen", keywords: "verbindung status backup email smtp push qr", group: "go", adminOnly: true },
  { id: "go-integrations", label: "Schnittstellen (API-Schlüssel, Webhooks, Kalender)", path: "/settings?tab=schnittstellen", keywords: "api schlüssel webhook n8n zapier kalender ics automation", group: "go", adminOnly: true },
  { id: "go-datev", label: "DATEV-Export / Finanzen", path: "/finance", keywords: "datev export steuer euer finanzen bank", group: "go" },
  { id: "go-stats", label: "Statistik", path: "/stats", keywords: "statistik auswertung umsatz", group: "go" },
];

/** Aktionen, die zur Eingabe passen (leere Eingabe = alle "Neu"-Aktionen). */
export function matchActions(query: string, isAdmin: boolean): QuickAction[] {
  const list = QUICK_ACTIONS.filter((a) => isAdmin || !a.adminOnly);
  const q = query.trim().toLowerCase();
  if (!q) return list.filter((a) => a.group === "new");
  return list.filter((a) => `${a.label} ${a.keywords}`.toLowerCase().includes(q)).slice(0, 6);
}
