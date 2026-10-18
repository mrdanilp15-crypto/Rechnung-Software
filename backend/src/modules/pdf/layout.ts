import { PDF_LAYOUTS, type PdfLayout } from "./documentTemplate";

/** Layout aus Firmeneinstellung; ein gültiger ?layout=-Parameter überschreibt es (Vorschau in den Einstellungen). */
export function resolvePdfLayout(companyLayout?: string | null, override?: unknown): PdfLayout {
  const wanted = typeof override === "string" ? override.toUpperCase() : companyLayout;
  return PDF_LAYOUTS.includes(wanted as PdfLayout) ? (wanted as PdfLayout) : "CLEAR";
}
