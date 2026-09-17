/**
 * Sehr vereinfachte Einordnung für grenzüberschreitende Umsätze - deckt die häufigsten
 * Fälle ab (innergemeinschaftliche B2B-Leistung mit Reverse-Charge, Ausfuhr in ein
 * Nicht-EU-Land), ersetzt aber keine steuerliche Beratung bei komplexeren Fällen
 * (Werklieferungen, Montage, Reihengeschäfte, OSS-pflichtige B2C-Fernverkäufe usw.).
 * Nur relevant, wenn tatsächlich außerhalb Deutschlands verkauft wird.
 */

// EU-Mitgliedstaaten (ISO-3166-1-alpha-2), Stand 2026. Deutschland selbst absichtlich
// NICHT ausgeschlossen, da für die reine Mitgliedschaftsprüfung relevant.
export const EU_COUNTRY_CODES = new Set([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE",
  "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE",
]);

export type VatNoticeKey = "REVERSE_CHARGE" | "EXPORT" | null;

export interface VatTreatment {
  forceZeroVat: boolean;
  noticeKey: VatNoticeKey;
}

/**
 * company.country ist praktisch immer "DE" für Nutzer dieser Software - die Prüfung
 * berücksichtigt den Firmensitz trotzdem explizit, statt "DE" hart zu kodieren.
 */
export function determineVatTreatment(
  companyCountry: string,
  customer: { country: string; type: string; vatId?: string | null }
): VatTreatment {
  if (customer.country === companyCountry) {
    return { forceZeroVat: false, noticeKey: null };
  }
  const isEuCustomer = EU_COUNTRY_CODES.has(customer.country);
  if (isEuCustomer) {
    // Reverse-Charge (Art. 44 MwStSystRL / §13b UStG) setzt B2B UND eine gültige
    // USt-IdNr. des Empfängers voraus - ohne beides bleibt es eine normale, mit
    // deutscher USt. zu belastende Lieferung/Leistung (z.B. B2C-Fernverkauf, für den statt-
    // dessen ggf. das OSS-Verfahren gilt, das diese Software nicht abbildet).
    if (customer.type === "GEWERBLICH" && customer.vatId) {
      return { forceZeroVat: true, noticeKey: "REVERSE_CHARGE" };
    }
    return { forceZeroVat: false, noticeKey: null };
  }
  // Nicht-EU-Ausland: steuerfreie Ausfuhrlieferung (§4 Nr. 1a UStG).
  return { forceZeroVat: true, noticeKey: "EXPORT" };
}
