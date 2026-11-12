/** Adress-Hilfen: eingefügten Adresstext zerlegen und Links zu Google Maps bauen. Reine Funktionen (testbar). */

export interface AddressValue {
  street: string;
  postalCode: string;
  city: string;
  country: string;
}

const COUNTRY_NAMES: Record<string, string> = {
  deutschland: "DE", germany: "DE", allemagne: "DE",
  österreich: "AT", oesterreich: "AT", austria: "AT",
  schweiz: "CH", switzerland: "CH", suisse: "CH",
  niederlande: "NL", netherlands: "NL", holland: "NL",
  belgien: "BE", belgium: "BE",
  frankreich: "FR", france: "FR",
  italien: "IT", italy: "IT",
  spanien: "ES", spain: "ES",
  polen: "PL", poland: "PL",
  dänemark: "DK", daenemark: "DK", denmark: "DK",
  luxemburg: "LU", luxembourg: "LU",
  tschechien: "CZ", "czech republic": "CZ",
};
const PREFIX_TO_ISO: Record<string, string> = { D: "DE", DE: "DE", A: "AT", AT: "AT", CH: "CH", NL: "NL", B: "BE", BE: "BE", F: "FR", FR: "FR", I: "IT", IT: "IT", L: "LU", LU: "LU", PL: "PL", DK: "DK", CZ: "CZ", E: "ES", ES: "ES" };

const postalLine = /^(?:([A-Za-z]{1,2})[- ])?(\d{4,5})\s+(.+)$/;

/**
 * Zerlegt eingefügten Adresstext, z.B. "Musterstraße 12, 12345 Musterstadt" oder mehrere Zeilen ("Max Mustermann / Musterstraße 12 / 12345 Musterstadt / Deutschland").
 * Liefert nur, was erkannt wurde; null, wenn nichts Brauchbares dabei ist. Namen in der ersten Zeile werden nicht als Straße genommen:
 * die Straße ist die Zeile direkt vor der Postleitzahl.
 */
export function parseAddressBlock(text: string): Partial<AddressValue> | null {
  const parts = text
    .split(/\r?\n|;/)
    .flatMap((l) => l.split(/\s*,\s*/))
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length === 0) return null;

  const out: Partial<AddressValue> = {};
  const at = parts.findIndex((p) => postalLine.test(p));
  if (at >= 0) {
    const m = postalLine.exec(parts[at])!;
    out.postalCode = m[2];
    out.city = m[3].trim();
    if (m[1]) out.country = PREFIX_TO_ISO[m[1].toUpperCase()] ?? undefined;
    if (!out.country) delete out.country;
    // Straße = die Zeile direkt vor der PLZ, aber nur mit Hausnummer - sonst ist es ein Name oder Firmenzusatz
    if (at > 0 && /\d/.test(parts[at - 1]) && !postalLine.test(parts[at - 1]) && !/@/.test(parts[at - 1])) out.street = parts[at - 1];
    const next = parts[at + 1]?.toLowerCase();
    if (next && COUNTRY_NAMES[next]) out.country = COUNTRY_NAMES[next];
  } else {
    const street = parts.find((p) => /[A-Za-zÄÖÜäöüß]/.test(p) && /\d/.test(p) && !/@/.test(p));
    if (street) out.street = street;
  }
  return Object.keys(out).length > 0 ? out : null;
}

const oneLine = (a: Partial<AddressValue>) => [a.street, [a.postalCode, a.city].filter(Boolean).join(" "), a.country && a.country !== "DE" ? a.country : "Deutschland"].filter(Boolean).join(", ");

/** Google Maps: Adresse auf der Karte zeigen (öffnet nur die Seite, nichts wird vorab gesendet) */
export const mapsSearchUrl = (a: Partial<AddressValue>) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(oneLine(a))}`;
/** Google Maps: Route zur Adresse */
export const mapsRouteUrl = (a: Partial<AddressValue>) => `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(oneLine(a))}`;
/** Genug Angaben, um die Adresse auf der Karte zu suchen? */
export const hasMapAddress = (a: Partial<AddressValue>) => !!a.street?.trim() && !!(a.city?.trim() || a.postalCode?.trim());
