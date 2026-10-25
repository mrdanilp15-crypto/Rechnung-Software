/**
 * Abschreibung (AfA) für das Anlageverzeichnis.
 *
 *  - GWG (geringwertiges Wirtschaftsgut): volle Anschaffungskosten im Jahr der Anschaffung (Sofortabzug).
 *  - LINEAR: gleichmäßig über die Nutzungsdauer; im Anschaffungsjahr zeitanteilig ab dem Monat der Anschaffung (volle Monate),
 *    der Rest im letzten Jahr, sodass die Summe genau den Anschaffungskosten entspricht. Abgeschrieben wird auf 0
 *    (ein Erinnerungswert von 1 € ist bei Bedarf Sache des Steuerberaters).
 *
 * Alle Beträge in Cent. Für Kleinunternehmer gelten als Anschaffungskosten die Bruttobeträge (Vorsteuer ist nicht abziehbar).
 */

export type DepreciationMethod = "GWG" | "LINEAR";

export interface AssetInput {
  purchaseDate: Date;
  costCents: number;
  method: DepreciationMethod;
  usefulLifeYears?: number | null;
}

export interface YearAmount {
  year: number;
  amountCents: number;
  /** Monate, auf die sich der Jahresbetrag verteilt (für die Monatsanzeige) */
  months: number;
}

export function depreciationSchedule(asset: AssetInput): YearAmount[] {
  const startYear = asset.purchaseDate.getFullYear();
  const startMonth = asset.purchaseDate.getMonth(); // 0-11
  if (asset.method === "GWG" || !asset.usefulLifeYears || asset.usefulLifeYears < 1) {
    return [{ year: startYear, amountCents: asset.costCents, months: 1 }];
  }
  // Kumulierter Sollwert am Jahresende = Kosten x (abgeschriebene Monate / Gesamtmonate); der Jahresbetrag ist die Differenz der
  // gerundeten Kumulierten - so entsteht kein Rest-Cent und die Summe stimmt exakt.
  const totalMonths = Math.floor(asset.usefulLifeYears) * 12;
  const out: YearAmount[] = [];
  let elapsed = 0;
  let writtenOff = 0;
  for (let i = 0; elapsed < totalMonths && i < 100; i++) {
    const months = i === 0 ? 12 - startMonth : 12;
    elapsed = Math.min(totalMonths, elapsed + months);
    const cumulative = Math.round((asset.costCents * elapsed) / totalMonths);
    out.push({ year: startYear + i, amountCents: cumulative - writtenOff, months: i === 0 ? months : Math.min(12, months) });
    writtenOff = cumulative;
  }
  return out;
}

export function depreciationForYear(asset: AssetInput, year: number): YearAmount | null {
  return depreciationSchedule(asset).find((s) => s.year === year) ?? null;
}

/** Restbuchwert zum Ende des angegebenen Jahres. */
export function bookValueAtYearEnd(asset: AssetInput, year: number): number {
  const written = depreciationSchedule(asset)
    .filter((s) => s.year <= year)
    .reduce((sum, s) => sum + s.amountCents, 0);
  return Math.max(0, asset.costCents - written);
}
