/**
 * Einordnung für grenzüberschreitende Umsätze - deckt die häufigsten Fälle ab, ersetzt aber
 * keine steuerliche Beratung bei komplexeren Konstellationen (Werklieferungen, Montage,
 * Reihengeschäfte, Dreiecksgeschäfte, OSS-pflichtige B2C-Fernverkäufe usw.).
 * Nur relevant, wenn tatsächlich außerhalb Deutschlands verkauft wird.
 *
 * Maßgeblich ist die ART der Leistung (SupplyType):
 *  - GOODS   = Lieferung von Waren (z.B. gedruckte Bauteile):
 *              EU-Unternehmer mit USt-IdNr. -> steuerfreie innergemeinschaftliche Lieferung
 *              (§4 Nr. 1b, §6a UStG), Drittland -> steuerfreie Ausfuhrlieferung (§4 Nr. 1a, §6 UStG).
 *  - SERVICE = sonstige Leistung (z.B. Konstruktion, reiner Dienstleistungsauftrag):
 *              EU-Unternehmer -> Leistungsort beim Empfänger (§3a Abs. 2 UStG), Steuerschuldner ist
 *              der Empfänger (Reverse-Charge); Drittland-Unternehmer -> nicht im Inland steuerbar.
 * Eine Verwechslung der beiden ist ein häufiger Rechnungsfehler: "Reverse-Charge" ist KEIN
 * zulässiger Hinweis für eine Warenlieferung.
 */

// EU-Mitgliedstaaten (ISO-3166-1-alpha-2), Stand 2026. Deutschland selbst absichtlich
// NICHT ausgeschlossen, da für die reine Mitgliedschaftsprüfung relevant.
export const EU_COUNTRY_CODES = new Set([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE",
  "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE",
]);

export type SupplyType = "GOODS" | "SERVICE";
export type VatNoticeKey = "INTRA_COMMUNITY_SUPPLY" | "REVERSE_CHARGE" | "EXPORT" | "NOT_TAXABLE_ABROAD" | null;

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
  customer: { country: string; type: string; vatId?: string | null },
  supplyType: SupplyType = "GOODS"
): VatTreatment {
  if (customer.country === companyCountry) {
    return { forceZeroVat: false, noticeKey: null };
  }
  const isBusiness = customer.type === "GEWERBLICH";

  if (EU_COUNTRY_CODES.has(customer.country)) {
    // Beide EU-Sonderfälle setzen B2B UND eine USt-IdNr. des Empfängers voraus - ohne beides
    // bleibt es eine normale, mit deutscher USt. zu belastende Lieferung/Leistung (z.B.
    // B2C-Fernverkauf, für den ggf. das OSS-Verfahren gilt, das diese Software nicht abbildet).
    if (isBusiness && customer.vatId) {
      return { forceZeroVat: true, noticeKey: supplyType === "GOODS" ? "INTRA_COMMUNITY_SUPPLY" : "REVERSE_CHARGE" };
    }
    return { forceZeroVat: false, noticeKey: null };
  }

  // Drittland
  if (supplyType === "GOODS") return { forceZeroVat: true, noticeKey: "EXPORT" };
  if (isBusiness) return { forceZeroVat: true, noticeKey: "NOT_TAXABLE_ABROAD" };
  return { forceZeroVat: false, noticeKey: null };
}
