/**
 * Adressvorschläge aus Photon (photon.komoot.io, Daten von OpenStreetMap). Reine Logik ohne Netzwerk (testbar):
 * Anfrage bereinigen und die GeoJSON-Antwort in Vorschläge bzw. Ortsnamen zu einer Postleitzahl umwandeln.
 */

export interface AddressSuggestion {
  /** Anzeigetext, z.B. "Alter Steinweg 5, 48143 Münster" */
  label: string;
  street: string;
  houseNumber: string;
  postalCode: string;
  city: string;
  /** ISO-Code, z.B. "DE" */
  country: string;
}

interface PhotonFeature {
  properties?: Record<string, unknown>;
}

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

function features(json: unknown): PhotonFeature[] {
  const list = (json as { features?: unknown })?.features;
  return Array.isArray(list) ? (list as PhotonFeature[]) : [];
}

/** Steuerzeichen raus, Leerraum glätten, Länge begrenzen - die Eingabe geht an einen externen Dienst. */
export function sanitizeQuery(q: string, max = 120): string {
  return q.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

/**
 * Vorschläge für Adressen. Gezeigt werden Treffer mit Straße (Gebäude/Hausnummern oder die Straße selbst) und Ort;
 * Treffer ohne Straße (reine Orte, Sehenswürdigkeiten ohne Adresse) fallen weg. Das gewünschte Land steht vorn.
 */
export function parsePhotonAddresses(json: unknown, preferCountry?: string, limit = 6): AddressSuggestion[] {
  const seen = new Set<string>();
  const out: AddressSuggestion[] = [];
  for (const f of features(json)) {
    const p = f.properties ?? {};
    const street = str(p.street) || (str(p.osm_key) === "highway" ? str(p.name) : "");
    const city = str(p.city) || str(p.town) || str(p.village) || str(p.county);
    const postalCode = str(p.postcode);
    if (!street || (!city && !postalCode)) continue;
    const houseNumber = str(p.housenumber);
    const country = str(p.countrycode).toUpperCase();
    const label = `${street}${houseNumber ? ` ${houseNumber}` : ""}, ${[postalCode, city].filter(Boolean).join(" ")}`;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ label, street, houseNumber, postalCode, city, country });
  }
  if (preferCountry) {
    const want = preferCountry.toUpperCase();
    out.sort((a, b) => Number(b.country === want) - Number(a.country === want));
  }
  return out.slice(0, limit);
}

/** Ortsnamen zu einer Postleitzahl, häufigste zuerst (eine PLZ kann mehrere Orte umfassen). */
export function parsePhotonCities(json: unknown, postalCode: string, country: string): string[] {
  const want = country.toUpperCase();
  const count = new Map<string, number>();
  const bump = (city: string, weight: number) => city && count.set(city, (count.get(city) ?? 0) + weight);
  for (const f of features(json)) {
    const p = f.properties ?? {};
    if (str(p.countrycode).toUpperCase() !== want) continue;
    const city = str(p.city) || str(p.town) || str(p.village);
    if (str(p.osm_value) === "postcode" && str(p.name) === postalCode) bump(city, 10);
    else if (str(p.postcode) === postalCode) bump(city, 1);
  }
  return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([city]) => city);
}
