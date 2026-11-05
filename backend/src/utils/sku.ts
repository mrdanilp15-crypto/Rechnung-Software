/**
 * Artikelnummern: Die nächste freie Nummer wird aus den vorhandenen abgeleitet (Präfix und Stellenzahl,
 * höchste Zahl plus eins). Hat der Nutzer schon ein Präfix getippt (z.B. "HW-" oder "HW"), zählt die Reihe dieses
 * Präfixes weiter (HW-1, HW-2 → HW-3), unabhängig von anderen Reihen (T4-1 ...). Gibt es noch keine, gilt das
 * Standard-Präfix. Vergleich ohne Beachtung der Groß-/Kleinschreibung.
 */

export const normalizeSku = (s: string) => s.trim().toLowerCase();

export interface NextSku {
  sku: string;
  prefix: string;
}

const TRAILING_DIGITS = /^(.*?)(\d+)$/;

/** Der Teil vor der abschließenden Zahl: "HW-12" → "HW-", "HW-" → "HW-", "12" → "". */
export const prefixOf = (s: string) => s.trim().replace(/\d+$/, "");

export function nextSku(existing: (string | null | undefined)[], defaultPrefix: string, minDigits = 4, typed?: string): NextSku {
  const used = new Set(existing.filter((s): s is string => !!s && !!s.trim()).map(normalizeSku));
  const parsed = [...used]
    .map((s) => TRAILING_DIGITS.exec(s))
    .filter((m): m is RegExpExecArray => !!m)
    .map((m) => ({ prefix: m[1], num: parseInt(m[2], 10), width: m[2].length }));
  const counts = new Map<string, number>();
  for (const p of parsed) counts.set(p.prefix, (counts.get(p.prefix) ?? 0) + 1);
  const byCount = (list: [string, number][]) => list.sort((a, b) => b[1] - a[1])[0]?.[0];
  const mostCommon = byCount([...counts.entries()]);

  const typedRaw = typed ? prefixOf(typed) : "";
  const typedLower = typedRaw.toLowerCase();
  let best: string | undefined;
  if (typedLower) {
    // genau dieses Präfix, sonst das häufigste, das mit dem Getippten beginnt ("HW" → "hw-")
    best = counts.has(typedLower) ? typedLower : byCount([...counts.entries()].filter(([p]) => p.startsWith(typedLower)));
  } else {
    best = mostCommon;
  }

  // Schreibweise des Präfixes wie bei der ersten Verwendung (Groß-/Kleinschreibung wie eingegeben)
  let prefix: string;
  if (best !== undefined) {
    prefix = best;
    for (const e of existing) {
      const mm = e ? TRAILING_DIGITS.exec(e.trim()) : null;
      if (mm && mm[1].toLowerCase() === best) {
        prefix = mm[1];
        break;
      }
    }
  } else {
    prefix = typedRaw || defaultPrefix; // neues Präfix: so, wie getippt
  }

  const same = parsed.filter((p) => p.prefix === (best ?? prefix.toLowerCase()));
  let width: number;
  if (same.length > 0) width = Math.max(...same.map((p) => p.width)); // vorhandene Schreibweise beibehalten
  else if (typedRaw && mostCommon !== undefined) width = Math.max(...parsed.filter((p) => p.prefix === mostCommon).map((p) => p.width)); // neue Reihe im Stil der übrigen
  else width = typedRaw ? 1 : minDigits;
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
