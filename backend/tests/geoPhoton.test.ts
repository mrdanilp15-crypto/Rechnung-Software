import { describe, expect, it } from "vitest";
import { parsePhotonAddresses, parsePhotonCities, sanitizeQuery } from "../src/modules/geo/photon";

const feat = (properties: Record<string, unknown>) => ({ type: "Feature", properties });

describe("Adressvorschläge (Photon)", () => {
  it("bereinigt die Eingabe: Steuerzeichen, doppelte Leerzeichen, Länge", () => {
    expect(sanitizeQuery("  Alter\u0000 Steinweg \n 5  ")).toBe("Alter Steinweg 5");
    expect(sanitizeQuery("x".repeat(500)).length).toBe(120);
  });

  it("macht aus Gebäude-Treffern Vorschläge mit Straße, Hausnummer, PLZ, Ort und Land", () => {
    const r = parsePhotonAddresses({ features: [feat({ street: "Alter Steinweg", housenumber: "5", postcode: "48143", city: "Münster", countrycode: "DE", osm_key: "building" })] });
    expect(r).toEqual([{ label: "Alter Steinweg 5, 48143 Münster", street: "Alter Steinweg", houseNumber: "5", postalCode: "48143", city: "Münster", country: "DE" }]);
  });

  it("nimmt bei Straßen ohne Hausnummer den Straßennamen, lässt Treffer ohne Straße weg", () => {
    const r = parsePhotonAddresses({
      features: [
        feat({ name: "Hauptstraße", osm_key: "highway", postcode: "10827", city: "Berlin", countrycode: "DE" }),
        feat({ name: "Berlin", osm_key: "place", city: "Berlin", countrycode: "DE" }),
        feat({ name: "Kneipe", osm_key: "amenity", postcode: "10115", city: "Berlin", countrycode: "DE" }),
      ],
    });
    expect(r.map((x) => x.label)).toEqual(["Hauptstraße, 10827 Berlin"]);
    expect(r[0].houseNumber).toBe("");
  });

  it("entfernt doppelte Vorschläge (z.B. Bank und Gebäude an derselben Adresse)", () => {
    const same = { street: "Alter Steinweg", housenumber: "5", postcode: "48143", city: "Münster", countrycode: "DE" };
    expect(parsePhotonAddresses({ features: [feat({ ...same, osm_key: "building" }), feat({ ...same, name: "Santander", osm_key: "amenity" })] })).toHaveLength(1);
  });

  it("stellt das gewünschte Land nach vorn und begrenzt die Anzahl", () => {
    const f = (country: string, n: number) => feat({ street: `Weg ${n}`, postcode: "1000", city: "X", countrycode: country });
    const r = parsePhotonAddresses({ features: [f("AT", 1), f("AT", 2), f("DE", 3), f("DE", 4)] }, "de", 3);
    expect(r.map((x) => x.country)).toEqual(["DE", "DE", "AT"]);
  });

  it("verträgt kaputte Antworten", () => {
    expect(parsePhotonAddresses(null)).toEqual([]);
    expect(parsePhotonAddresses({ features: "x" })).toEqual([]);
    expect(parsePhotonCities(undefined, "48149", "DE")).toEqual([]);
  });

  it("findet den Ort zu einer Postleitzahl und ignoriert gleiche Zahlen in anderen Ländern", () => {
    const json = {
      features: [
        feat({ osm_key: "place", osm_value: "postcode", name: "48149", city: "Münster", countrycode: "DE" }),
        feat({ osm_key: "place", osm_value: "postcode", name: "48149", city: "Irgendwo", countrycode: "US" }),
        feat({ osm_key: "amenity", postcode: "48149", city: "Münster", countrycode: "DE" }),
        feat({ osm_key: "amenity", postcode: "48149", city: "Nachbarort", countrycode: "DE" }),
      ],
    };
    expect(parsePhotonCities(json, "48149", "DE")).toEqual(["Münster", "Nachbarort"]);
  });
});
