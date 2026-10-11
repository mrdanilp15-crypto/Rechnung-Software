import type { Company, Customer, Invoice } from "@prisma/client";
import { prisma } from "../../db/prisma";

/**
 * Nicht-blockierende Prüfung auf Pflichtangaben nach §14 UStG (Rechnungsangaben).
 * Gibt eine Liste menschenlesbarer Hinweise zurück - keine rechtsverbindliche Prüfung,
 * sondern ein Hinweis, was auf der Rechnung typischerweise fehlt.
 */
export function getInvoiceComplianceWarnings(company: Company, invoice: Pick<Invoice, "deliveryDate" | "issueDate" | "vatNoticeKey">, customer?: Pick<Customer, "vatId" | "name">): string[] {
  const warnings: string[] = [];

  if (!company.taxId && !company.vatId) {
    warnings.push("Weder Steuernummer noch USt-IdNr. in den Firmeneinstellungen hinterlegt (§14 Abs. 4 Nr. 2 UStG).");
  }
  if (!company.street || !company.postalCode || !company.city) {
    warnings.push("Firmenanschrift ist unvollständig (Straße/PLZ/Ort in den Einstellungen ergänzen).");
  }
  if (!invoice.deliveryDate) {
    warnings.push("Kein Leistungs-/Lieferdatum gesetzt - es wird das Rechnungsdatum als Leistungsdatum ausgewiesen (§14 Abs. 4 Nr. 6 UStG). Weicht der tatsächliche Liefer-/Leistungstag ab, bitte eintragen.");
  }

  // Angaben auf Geschäftsbriefen/Rechnungen von Handelsgesellschaften (§35a GmbHG, §80 AktG,
  // §37a HGB für e.K.): Rechtsform, Sitz, Registergericht, Registernummer, Geschäftsführer.
  const identity = `${company.legalForm ?? ""} ${company.name}`;
  const isRegisteredForm = /\b(gmbh|ug|ag|se|kg|ohg|gbr mbh|e\.\s?k\.?|e\.\s?kfr\.?)\b/i.test(identity) || /haftungsbeschränkt/i.test(identity);
  if (isRegisteredForm && (!company.registerCourt || !company.registerNumber)) {
    warnings.push("Registergericht und Handelsregisternummer fehlen in den Firmeneinstellungen - bei GmbH/UG/AG/KG/e.K. Pflichtangabe auf Rechnungen (§35a GmbHG, §37a HGB).");
  }
  if ((/\b(gmbh|ug|ag|se)\b/i.test(identity) || /haftungsbeschränkt/i.test(identity)) && !company.managingDirector) {
    warnings.push("Geschäftsführer/Vorstand fehlt in den Firmeneinstellungen - bei GmbH/UG/AG Pflichtangabe auf Rechnungen.");
  }

  // Grenzüberschreitende Umsätze
  if (invoice.vatNoticeKey === "INTRA_COMMUNITY_SUPPLY" || invoice.vatNoticeKey === "REVERSE_CHARGE") {
    if (!company.vatId) warnings.push("Für steuerfreie innergemeinschaftliche Umsätze ist Ihre eigene USt-IdNr. Pflicht (§14a UStG) - bitte in den Firmeneinstellungen ergänzen.");
    if (customer && !customer.vatId) warnings.push(`Die USt-IdNr. des Kunden "${customer.name}" fehlt (Pflichtangabe bei innergemeinschaftlichen Umsätzen).`);
  }
  if (invoice.vatNoticeKey === "INTRA_COMMUNITY_SUPPLY") {
    warnings.push("Innergemeinschaftliche Lieferung: Die USt-IdNr. des Kunden vorab qualifiziert beim Bundeszentralamt für Steuern bestätigen lassen und den Belegnachweis (Gelangensbestätigung/Versandnachweis) aufbewahren - sonst droht die nachträgliche Versteuerung mit 19 %.");
  }
  if (invoice.vatNoticeKey === "EXPORT") {
    warnings.push("Ausfuhrlieferung: Den Ausfuhrnachweis (Ausgangsvermerk/Zollbeleg) aufbewahren - ohne Nachweis ist die Steuerbefreiung nicht anerkannt.");
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

  // Gesamtumsatz im Sinne von §19 UStG = Nettoumsatz tatsächlich ausgegebener Rechnungen.
  // Entwürfe zählen noch nicht; stornierte Originale UND ihre Korrekturbelege (negative
  // Beträge) werden beide ausgeklammert, sonst würde ein Storno den Umsatz doppelt mindern.
  const countable = { companyId, status: { in: ["SENT", "PAID", "OVERDUE"] }, isCancellationDocument: false };
  const [currentYearResult, priorYearResult] = await Promise.all([
    prisma.invoice.aggregate({
      where: { ...countable, issueDate: { gte: yearStart, lt: yearEnd } },
      _sum: { subtotalCents: true },
    }),
    prisma.invoice.aggregate({
      where: { ...countable, issueDate: { gte: priorYearStart, lt: yearStart } },
      _sum: { subtotalCents: true },
    }),
  ]);

  const yearRevenueCents = currentYearResult._sum.subtotalCents ?? 0;
  const priorYearRevenueCents = priorYearResult._sum.subtotalCents ?? 0;
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
