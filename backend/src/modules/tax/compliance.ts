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
 * Kleinunternehmer-Schwellenwert-Warner (§19 UStG): summiert den Bruttoumsatz aller
 * nicht-stornierten Rechnungen des laufenden Kalenderjahres (Ausstellungsdatum) und
 * vergleicht ihn mit der konfigurierten Grenze (Standard: 22.000 €, Stand 2026).
 */
export async function getRevenueThresholdStatus(companyId: string) {
  const company = await prisma.company.findUniqueOrThrow({ where: { id: companyId } });
  const yearStart = new Date(new Date().getFullYear(), 0, 1);
  const yearEnd = new Date(new Date().getFullYear() + 1, 0, 1);

  const result = await prisma.invoice.aggregate({
    where: {
      companyId,
      status: { not: "CANCELLED" },
      issueDate: { gte: yearStart, lt: yearEnd },
    },
    _sum: { totalCents: true },
  });

  const yearRevenueCents = result._sum.totalCents ?? 0;
  const thresholdCents = company.smallBusinessThresholdCents;
  const percentUsed = thresholdCents > 0 ? Math.round((yearRevenueCents / thresholdCents) * 1000) / 10 : 0;

  return {
    isSmallBusiness: company.isSmallBusiness,
    yearRevenueCents,
    thresholdCents,
    percentUsed,
    isApproaching: percentUsed >= 80 && percentUsed < 100,
    isExceeded: yearRevenueCents > thresholdCents,
  };
}
