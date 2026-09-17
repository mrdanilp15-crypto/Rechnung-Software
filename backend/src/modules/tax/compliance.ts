import type { Company, Invoice } from "@prisma/client";
import { prisma } from "../../db/prisma";

/**
 * Nicht-blockierende Prüfung auf Pflichtangaben nach §14 UStG (Rechnungsangaben).
 * Gibt eine Liste menschenlesbarer Hinweise zurück - keine rechtsverbindliche Prüfung,
 * sondern ein Hinweis, was auf der Rechnung typischerweise fehlt.
 */
export function getInvoiceComplianceWarnings(company: Company, invoice: Pick<Invoice, "deliveryDate" | "issueDate">): string[] {
  const warnings: string[] = [];

  if (!company.taxId && !company.vatId) {
    warnings.push("Weder Steuernummer noch USt-IdNr. in den Firmeneinstellungen hinterlegt (§14 Abs. 4 Nr. 2 UStG).");
  }
  if (!company.street || !company.postalCode || !company.city) {
    warnings.push("Firmenanschrift ist unvollständig (Straße/PLZ/Ort in den Einstellungen ergänzen).");
  }
  if (!invoice.deliveryDate) {
    warnings.push("Kein Leistungs-/Lieferdatum gesetzt - wird ohne Angabe als Rechnungsdatum angenommen (§14 Abs. 4 Nr. 6 UStG verlangt i.d.R. eine explizite Angabe).");
  }

  return warnings;
}

/**
 * Kleinunternehmer-Schwellenwert-Warner (§19 UStG, Fassung seit 1.1.2025): Es gelten
 * ZWEI Grenzen gleichzeitig -
 *   1. Vorjahresumsatz darf 25.000 € nicht überschritten haben (sonst entfällt die
 *      Steuerbefreiung für das GESAMTE laufende Jahr rückwirkend zum Jahresbeginn), und
 *   2. der Umsatz im laufenden Kalenderjahr darf 100.000 € nicht übersteigen - wird diese
 *      Grenze unterjährig überschritten, endet die Steuerbefreiung SOFORT ab dem Umsatz,
 *      der die Grenze überschreitet (nicht erst im Folgejahr, anders als vor der Reform).
 * Beide Beträge sind über Company.smallBusinessThresholdCents (Vorjahr) und
 * Company.smallBusinessCurrentYearThresholdCents (laufendes Jahr) konfigurierbar, falls
 * sich die gesetzlichen Werte künftig erneut ändern. Reine Warnfunktion, keine
 * automatische Sperre - die endgültige Beurteilung obliegt dem Steuerberater/Finanzamt.
 */
export async function getRevenueThresholdStatus(companyId: string) {
  const company = await prisma.company.findUniqueOrThrow({ where: { id: companyId } });
  const currentYear = new Date().getFullYear();
  const yearStart = new Date(currentYear, 0, 1);
  const yearEnd = new Date(currentYear + 1, 0, 1);
  const priorYearStart = new Date(currentYear - 1, 0, 1);

  const [currentYearResult, priorYearResult] = await Promise.all([
    prisma.invoice.aggregate({
      where: { companyId, status: { not: "CANCELLED" }, issueDate: { gte: yearStart, lt: yearEnd } },
      _sum: { totalCents: true },
    }),
    prisma.invoice.aggregate({
      where: { companyId, status: { not: "CANCELLED" }, issueDate: { gte: priorYearStart, lt: yearStart } },
      _sum: { totalCents: true },
    }),
  ]);

  const yearRevenueCents = currentYearResult._sum.totalCents ?? 0;
  const priorYearRevenueCents = priorYearResult._sum.totalCents ?? 0;
  const thresholdCents = company.smallBusinessThresholdCents; // Vorjahresgrenze (25.000 €)
  const currentYearThresholdCents = company.smallBusinessCurrentYearThresholdCents; // laufendes Jahr (100.000 €)
  const percentUsed = currentYearThresholdCents > 0 ? Math.round((yearRevenueCents / currentYearThresholdCents) * 1000) / 10 : 0;
  const priorYearExceeded = priorYearRevenueCents > thresholdCents;
  const currentYearExceeded = yearRevenueCents > currentYearThresholdCents;

  return {
    isSmallBusiness: company.isSmallBusiness,
    yearRevenueCents,
    priorYearRevenueCents,
    thresholdCents,
    currentYearThresholdCents,
    percentUsed,
    isApproaching: percentUsed >= 80 && percentUsed < 100,
    // Rückwärtskompatibel: "isExceeded" bleibt bestehen und bildet weiterhin primär das
    // laufende Jahr ab (100.000 €-Grenze, sofortiger Wegfall der Befreiung).
    isExceeded: currentYearExceeded,
    priorYearExceeded,
    currentYearExceeded,
  };
}
