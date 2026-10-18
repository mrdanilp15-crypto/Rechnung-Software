/**
 * Platzhalter in Begrüßungs- und Schlusstexten ("Sehr geehrte Damen und Herren, ... zahlbar bis {faellig}").
 * Die Texte werden am Beleg gespeichert (damit eine versendete Rechnung unveränderlich bleibt) und erst
 * beim Erzeugen des PDFs mit den aktuellen Belegdaten gefüllt. Unbekannte Platzhalter bleiben unverändert
 * stehen, damit Tippfehler sichtbar werden statt stillschweigend zu verschwinden.
 */
export const PLACEHOLDER_HELP: { key: string; description: string }[] = [
  { key: "{kunde}", description: "Name des Kunden" },
  { key: "{ansprechpartner}", description: "Ansprechpartner beim Kunden (sonst Kundenname)" },
  { key: "{nummer}", description: "Belegnummer" },
  { key: "{datum}", description: "Belegdatum" },
  { key: "{faellig}", description: "Fälligkeitsdatum bzw. gültig bis" },
  { key: "{betrag}", description: "Gesamtbetrag" },
  { key: "{firma}", description: "Name Ihrer Firma" },
];

export interface PlaceholderValues {
  kunde: string;
  ansprechpartner: string;
  nummer: string;
  datum: string;
  faellig: string;
  betrag: string;
  firma: string;
}

export function fillPlaceholders(text: string | null | undefined, values: PlaceholderValues): string {
  if (!text) return "";
  // Ohne Datum (z.B. Angebot ohne Gültigkeit) lieber ganz weglassen als "bis zum ." auszugeben
  if (!values.faellig) text = text.replace(/\s*(?:bis zum|bis|until|by)\s*\{faellig\}/gi, "");
  return text.replace(/\{(kunde|ansprechpartner|nummer|datum|faellig|betrag|firma)\}/gi, (_m, key: string) => values[key.toLowerCase() as keyof PlaceholderValues] ?? "");
}
