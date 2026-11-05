/**
 * Artikelnummern: Die nächste freie Nummer wird aus den vorhandenen abgeleitet (Präfix und Stellenzahl der meisten bisherigen Nummern,
 * höchste Zahl plus eins). Gibt es noch keine, gilt das Standard-Präfix. Vergleich ohne Beachtung der Groß-/Kleinschreibung.
 */

export const normalizeSku = (s: string) => s.trim().toLowerCase();

export interface NextSku {
  sku: string;
  prefix: string;
}

export function nextSku(existing: (string | null | undefined)[], defaultPrefix: string, minDigits = 4): NextSku {
  const used = new Set(existing.filter((s): s is string => !!s && !!s.trim()).map(normalizeSku));
  const parsed = [...used]
    .map((s) => /^(.*?)(\d+)$/.exec(s))
    .filter((m): m is RegExpExecArray => !!m)
    .map((m) => ({ prefix: m[1], num: parseInt(m[2], 10), width: m[2].length }));
  // häufigstes Präfix gewinnt; bei Gleichstand das mit der höheren Nummer
  const counts = new Map<string, number>();
  for (const p of parsed) counts.set(p.prefix, (counts.get(p.prefix) ?? 0) + 1);
  const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  // Präfix in der Schreibweise der ersten Verwendung zurückgeben (Groß-/Kleinschreibung wie eingegeben)
  let prefix = defaultPrefix;
  if (best !== undefined) {
    prefix = best;
    for (const e of existing) {
      const mm = e ? /^(.*?)(\d+)$/.exec(e.trim()) : null;
      if (mm && mm[1].toLowerCase() === best) { prefix = mm[1]; break; }
    }
  }
  const same = parsed.filter((p) => p.prefix === (best ?? defaultPrefix.toLowerCase()));
  const width = same.length > 0 ? Math.max(...same.map((p) => p.width)) : minDigits; // vorhandene Schreibweise beibehalten
  let n = Math.max(0, ...same.map((p) => p.num)) + 1;
  let sku = `${prefix}${String(n).padStart(width, "0")}`;
  while (used.has(normalizeSku(sku))) {
    n += 1;
    sku = `${prefix}${String(n).padStart(width, "0")}`;
  }
  return { sku, prefix };
}

/** Gibt den schon vergebenen Eintrag zurück, wenn die Nummer bei einem anderen Artikel vorkommt. */
export function findDuplicate<T extends { id: string; sku: string | null }>(rows: T[], sku: string, selfId?: string): T | undefined {
  const k = normalizeSku(sku);
  return rows.find((r) => r.id !== selfId && !!r.sku && normalizeSku(r.sku) === k);
}
