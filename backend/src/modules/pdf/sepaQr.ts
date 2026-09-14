/**
 * Erzeugt den Payload für einen SEPA-Überweisungs-QR-Code nach dem EPC069-12-Standard
 * (in Deutschland als "GiroCode" bekannt). Banking-Apps scannen diesen QR-Code und
 * befüllen automatisch eine SEPA-Überweisung.
 * Spezifikation: European Payments Council, "Quick Response Code Guidelines to Enable
 * the Initiation of a SCT".
 */
export interface SepaQrParams {
  name: string; // Name des Zahlungsempfängers (Firma)
  iban: string;
  bic?: string;
  amountCents: number;
  currency?: string;
  remittanceText: string; // Verwendungszweck, z.B. Rechnungsnummer
}

export function buildSepaQrPayload(params: SepaQrParams): string {
  const amount = (params.amountCents / 100).toFixed(2);
  const lines = [
    "BCD", // Service Tag
    "002", // Version
    "1", // Zeichensatz: UTF-8
    "SCT", // SEPA Credit Transfer
    params.bic ?? "",
    truncate(params.name, 70),
    params.iban.replace(/\s/g, ""),
    `${params.currency ?? "EUR"}${amount}`,
    "", // Purpose (leer)
    "", // Structured remittance (leer, wir nutzen unstrukturiert)
    truncate(params.remittanceText, 140),
    "", // Beleginformationen
  ];
  return lines.join("\n");
}

function truncate(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) : value;
}
