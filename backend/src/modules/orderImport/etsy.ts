import { parse } from "csv-parse/sync";

/**
 * Liest einen CSV-Export aus Etsy (Shop-Manager -> Einstellungen -> Optionen -> Daten herunterladen):
 * "Bestellte Artikel" (eine Zeile je Artikel) oder "Bestellungen" (eine Zeile je Bestellung). Die Spaltennamen werden tolerant
 * erkannt (Groß-/Kleinschreibung, Leerzeichen und Sonderzeichen egal; englische und deutsche Bezeichnungen). Es wird nichts
 * angenommen, was nicht in der Datei steht - fehlende Angaben erscheinen als Hinweis in der Vorschau.
 */

export interface ImportedItem {
  description: string;
  quantity: number;
  unitPriceCents: number;
}

export interface ImportedOrder {
  orderId: string;
  date: string | null; // YYYY-MM-DD
  buyerName: string;
  street: string | null;
  postalCode: string | null;
  city: string | null;
  country: string; // ISO-Code
  items: ImportedItem[];
  shippingCents: number;
  totalCents: number;
  currency: string | null;
  notes: string[];
  warnings: string[];
}

const norm = (h: string) => h.toLowerCase().replace(/[^a-z0-9äöüß]/g, "");

const ALIASES: Record<string, string[]> = {
  orderId: ["orderid", "bestellnummer", "bestellid", "ordernummer", "bestellung", "ordernumber"],
  date: ["saledate", "verkaufsdatum", "bestelldatum", "orderdate", "datum", "date"],
  name: ["shipname", "versandname", "fullname", "vollständigername", "name", "empfänger", "buyer", "käufer"],
  street: ["shipaddress1", "versandadresse1", "versandadresse", "adresse1", "street", "straße"],
  street2: ["shipaddress2", "versandadresse2", "adresse2"],
  city: ["shipcity", "versandort", "versandstadt", "city", "ort", "stadt"],
  zip: ["shipzipcode", "shippostalcode", "shipzip", "versandpostleitzahl", "versandplz", "postleitzahl", "plz", "zipcode"],
  country: ["shipcountry", "versandland", "country", "land"],
  itemName: ["itemname", "artikelname", "artikel", "title", "listingtitle", "produkt"],
  quantity: ["quantity", "menge", "anzahl"],
  price: ["price", "preis", "itemprice", "artikelpreis", "stückpreis"],
  shipping: ["ordershipping", "shipping", "versand", "versandkosten", "bestellversand"],
  orderValue: ["ordervalue", "bestellwert", "ordertotal", "bestellsumme", "gesamtbetrag"],
  currency: ["currency", "währung"],
  variations: ["variations", "variationen", "variante"],
  coupon: ["couponcode", "gutscheincode", "gutschein"],
  discount: ["discountamount", "rabattbetrag", "rabatt"],
  buyerNote: ["messagefrombuyer", "nachrichtvomkäufer", "notefrombuyer", "buyernote"],
};

const COUNTRY_CODES: Record<string, string> = {
  germany: "DE", deutschland: "DE", austria: "AT", österreich: "AT", switzerland: "CH", schweiz: "CH", netherlands: "NL", niederlande: "NL",
  france: "FR", frankreich: "FR", belgium: "BE", belgien: "BE", luxembourg: "LU", luxemburg: "LU", italy: "IT", italien: "IT", spain: "ES", spanien: "ES",
  poland: "PL", polen: "PL", denmark: "DK", dänemark: "DK", sweden: "SE", schweden: "SE", "united kingdom": "GB", großbritannien: "GB", "vereinigtes königreich": "GB",
  "united states": "US", usa: "US", ireland: "IE", irland: "IE", portugal: "PT", czechia: "CZ", "czech republic": "CZ", tschechien: "CZ", finland: "FI", finnland: "FI",
  norway: "NO", norwegen: "NO", hungary: "HU", ungarn: "HU", greece: "GR", griechenland: "GR",
};

/** Geldbetrag aus Text ("12.50", "12,50", "1.234,56", "€ 12,50", "EUR 12.50") in Cent. */
export function parseMoneyToCents(raw: string | undefined | null): number {
  if (!raw) return 0;
  let t = String(raw).replace(/[^0-9,.\-]/g, "");
  if (!t || t === "-") return 0;
  const lastComma = t.lastIndexOf(",");
  const lastDot = t.lastIndexOf(".");
  if (lastComma > -1 && lastDot > -1) {
    // das letzte Trennzeichen ist das Komma der Dezimalstellen
    t = lastComma > lastDot ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "");
  } else if (lastComma > -1) {
    // "1,234" (genau 3 Stellen) wäre Tausender, "12,5"/"12,50" Dezimal
    const digitsAfter = t.length - lastComma - 1;
    t = digitsAfter === 3 && !/^\-?0,/.test(t) ? t.replace(",", "") : t.replace(",", ".");
  }
  const n = parseFloat(t);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

export function countryCode(raw: string | undefined | null): { code: string; known: boolean } {
  const t = (raw ?? "").trim();
  if (!t) return { code: "DE", known: false };
  if (/^[A-Za-z]{2}$/.test(t)) return { code: t.toUpperCase(), known: true };
  const code = COUNTRY_CODES[t.toLowerCase()];
  return code ? { code, known: true } : { code: "DE", known: false };
}

/** Datum aus "10/05/2026", "05.10.2026", "2026-10-05" - Etsy-Exporte nutzen je nach Sprache MM/DD/YYYY oder TT.MM.JJJJ. */
export function parseDate(raw: string | undefined | null): string | null {
  const t = (raw ?? "").trim();
  if (!t) return null;
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = t.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/); // Etsy (englisch): MM/DD/YY(YY)
  if (m) {
    const year = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${year}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  }
  return null;
}

export function parseEtsyCsv(text: string): { orders: ImportedOrder[]; columns: Record<string, string | null> } {
  const clean = text.replace(/^﻿/, "");
  const firstLine = clean.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: Record<string, string>[] = parse(clean, { columns: true, skip_empty_lines: true, delimiter, relax_column_count: true, trim: true });
  if (rows.length === 0) return { orders: [], columns: {} };

  // Spalten zuordnen
  const headers = Object.keys(rows[0]);
  const find = (key: string): string | null => {
    for (const alias of ALIASES[key]) {
      const hit = headers.find((h) => norm(h) === alias);
      if (hit) return hit;
    }
    return null;
  };
  const col: Record<string, string | null> = {};
  for (const key of Object.keys(ALIASES)) col[key] = find(key);
  const get = (row: Record<string, string>, key: string) => (col[key] ? row[col[key]!] ?? "" : "");

  // Zeilen je Bestellung bündeln (ohne Bestellnummer gilt jede Zeile als eigene Bestellung)
  const groups = new Map<string, Record<string, string>[]>();
  rows.forEach((row, i) => {
    const id = get(row, "orderId").trim() || `Zeile-${i + 2}`;
    groups.set(id, [...(groups.get(id) ?? []), row]);
  });

  const orders: ImportedOrder[] = [];
  for (const [orderId, group] of groups) {
    const first = group[0];
    const warnings: string[] = [];
    const notes: string[] = [];
    const items: ImportedItem[] = [];
    for (const row of group) {
      const name = get(row, "itemName").trim();
      if (!name) continue;
      const qty = Math.max(1, parseFloat(get(row, "quantity").replace(",", ".")) || 1);
      const variations = get(row, "variations").trim();
      items.push({ description: variations ? `${name}\n${variations}` : name, quantity: qty, unitPriceCents: parseMoneyToCents(get(row, "price")) });
    }
    const orderValue = parseMoneyToCents(get(first, "orderValue"));
    if (items.length === 0) {
      // Datei mit einer Zeile je Bestellung: ohne Artikelliste eine Sammelposition
      items.push({ description: `Etsy-Bestellung ${orderId}`, quantity: 1, unitPriceCents: orderValue });
      warnings.push("Keine Artikel in der Datei - es wurde eine Sammelposition angelegt. Bitte Positionen im Auftrag ergänzen.");
    }
    const shippingCents = Math.max(...group.map((r) => parseMoneyToCents(get(r, "shipping"))), 0);
    const currency = get(first, "currency").trim().toUpperCase() || null;
    if (currency && currency !== "EUR") warnings.push(`Währung ${currency}: Beträge wurden unverändert übernommen - bitte umrechnen/prüfen.`);
    const coupon = get(first, "coupon").trim();
    if (coupon || group.some((r) => parseMoneyToCents(get(r, "discount")) > 0)) {
      warnings.push(`Rabatt/Gutschein${coupon ? ` (${coupon})` : ""} erkannt - wird NICHT automatisch abgezogen, bitte im Auftrag prüfen.`);
    }
    const buyerNote = get(first, "buyerNote").trim();
    if (buyerNote) notes.push(`Nachricht vom Käufer: ${buyerNote}`);
    const country = countryCode(get(first, "country"));
    if (!country.known && get(first, "country").trim()) warnings.push(`Land "${get(first, "country")}" nicht erkannt - auf DE gesetzt.`);
    const buyerName = get(first, "name").trim();
    if (!buyerName) warnings.push("Kein Name in der Datei - Kunde wird als \"Etsy-Käufer\" angelegt.");
    const street = [get(first, "street"), get(first, "street2")].map((x) => x.trim()).filter(Boolean).join(", ");
    const totalCents = items.reduce((s, i) => s + Math.round(i.quantity * i.unitPriceCents), 0) + shippingCents;
    orders.push({
      orderId,
      date: parseDate(get(first, "date")),
      buyerName: buyerName || "Etsy-Käufer",
      street: street || null,
      postalCode: get(first, "zip").trim() || null,
      city: get(first, "city").trim() || null,
      country: country.code,
      items,
      shippingCents,
      totalCents,
      currency,
      notes,
      warnings,
    });
  }
  return { orders, columns: col };
}
