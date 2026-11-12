import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { env } from "../../config/env";
import { requireAuth } from "../../middleware/auth";
import { parsePhotonAddresses, parsePhotonCities, sanitizeQuery, type AddressSuggestion } from "./photon";

/**
 * Adress-Hilfe für Kunden, Lieferanten und die eigene Firma: Vorschläge beim Tippen und Ort zur Postleitzahl.
 * Der Browser spricht nur mit diesem Endpunkt; die Software fragt bei Photon (photon.komoot.io, OpenStreetMap-Daten, Server in der EU) nach.
 * Dorthin geht nur der getippte Adresstext (Straße, Ort, PLZ) - keine Namen, keine Kundendaten. Abschaltbar mit GEO_LOOKUP_DISABLED=1;
 * ohne Internet bleibt die Eingabe von Hand wie bisher möglich.
 */
export const geoRouter = Router();
geoRouter.use(requireAuth);
geoRouter.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: 90,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Zu viele Adress-Anfragen. Bitte kurz warten." },
  })
);

const TTL_MS = 60 * 60 * 1000;
const MAX_CACHE = 500;
const cache = new Map<string, { at: number; json: unknown }>();

async function photon(params: Record<string, string>): Promise<unknown | null> {
  const url = `${env.GEO_LOOKUP_URL.replace(/\/+$/, "")}/?${new URLSearchParams({ lang: "de", ...params }).toString()}`;
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.json;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(4000), headers: { "User-Agent": "Rechnungssoftware-Selfhosted/1.0", Accept: "application/json" } });
    if (!res.ok) return null;
    const json = await res.json();
    if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value as string); // älteste zuerst
    cache.set(url, { at: Date.now(), json });
    return json;
  } catch {
    return null; // kein Internet, Dienst nicht erreichbar oder zu langsam
  }
}

const disabled = () => env.GEO_LOOKUP_DISABLED === "1" || env.GEO_LOOKUP_DISABLED.toLowerCase() === "true";

const addressQuery = z.object({ q: z.string().max(300), country: z.string().length(2).optional() });

/** Adressvorschläge zu dem, was gerade getippt wird. */
geoRouter.get("/address", async (req, res) => {
  const { q, country } = addressQuery.parse(req.query);
  const query = sanitizeQuery(q);
  if (disabled()) return res.json({ available: false, suggestions: [] as AddressSuggestion[] });
  if (query.length < 3) return res.json({ available: true, suggestions: [] as AddressSuggestion[] });
  const json = await photon({ q: query, limit: "10" });
  if (json === null) return res.json({ available: false, suggestions: [] as AddressSuggestion[] });
  res.json({ available: true, suggestions: parsePhotonAddresses(json, country) });
});

const postalQuery = z.object({ code: z.string().trim().regex(/^[A-Za-z0-9 -]{3,10}$/), country: z.string().length(2).default("DE") });

/** Ort(e) zu einer Postleitzahl, damit nach der PLZ der Ort von selbst eingetragen wird. */
geoRouter.get("/postal-code", async (req, res) => {
  const { code, country } = postalQuery.parse(req.query);
  if (disabled()) return res.json({ available: false, cities: [] as string[] });
  const json = await photon({ q: code, osm_tag: "place:postcode", limit: "15" });
  if (json === null) return res.json({ available: false, cities: [] as string[] });
  res.json({ available: true, cities: parsePhotonCities(json, code, country) });
});
