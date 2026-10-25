/** Kategorien des Belegarchivs mit Aufbewahrungsfrist in Jahren (0 = keine feste Frist). Fristen laufen ab Ende des Kalenderjahres des Belegdatums. */
export const ARCHIVE_CATEGORIES: { key: string; label: string; years: number; hint: string }[] = [
  { key: "EINGANGSRECHNUNG", label: "Eingangsrechnung", years: 8, hint: "Buchungsbeleg: 8 Jahre (§ 147 AO)" },
  { key: "AUSGANGSRECHNUNG", label: "Ausgangsrechnung (extern erstellt)", years: 8, hint: "Buchungsbeleg: 8 Jahre (§ 147 AO)" },
  { key: "QUITTUNG", label: "Quittung / Kassenbon", years: 8, hint: "Buchungsbeleg: 8 Jahre (§ 147 AO)" },
  { key: "KONTOAUSZUG", label: "Kontoauszug", years: 8, hint: "Buchungsbeleg: 8 Jahre (§ 147 AO)" },
  { key: "VERTRAG", label: "Vertrag", years: 6, hint: "Handelsbrief: 6 Jahre, gerechnet ab Vertragsende" },
  { key: "VERSICHERUNG", label: "Versicherung", years: 6, hint: "Empfehlung: 6 Jahre, Police solange sie gilt" },
  { key: "STEUER", label: "Steuer & Finanzamt", years: 10, hint: "Empfehlung: 10 Jahre (Steuerbescheide, Jahresabschlüsse)" },
  { key: "KORRESPONDENZ", label: "Geschäftsbrief / Korrespondenz", years: 6, hint: "Handelsbrief: 6 Jahre (§ 147 AO)" },
  { key: "ANGEBOT", label: "Angebot / Auftrag", years: 6, hint: "Handelsbrief: 6 Jahre (§ 147 AO)" },
  { key: "DESIGN", label: "3D-Design / Druckdatei", years: 0, hint: "Modelle (STL, 3MF, STEP), Slicer-Projekte, G-Code - keine feste Frist" },
  { key: "SONSTIGES", label: "Sonstiges", years: 0, hint: "Keine feste Frist" },
];

export const categoryLabel = (key: string) => ARCHIVE_CATEGORIES.find((c) => c.key === key)?.label ?? key;

/** Ende der Aufbewahrungsfrist (31.12. des Fristjahres) oder null ohne Frist. */
export function retainUntil(category: string, documentDate: string | Date): Date | null {
  const years = ARCHIVE_CATEGORIES.find((c) => c.key === category)?.years ?? 0;
  if (!years) return null;
  return new Date(new Date(documentDate).getFullYear() + years, 11, 31);
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}

export const formatDate = (d: string | Date) => new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(d));
