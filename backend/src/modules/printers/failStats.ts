/**
 * Echte Fehldruckquote aus den erkannten Druckaufträgen (nur Drucker mit Live-Verbindung). Als Fehldruck zählen fehlgeschlagene und
 * abgebrochene Drucke. Die Kalkulation rechnet "Maschinenkosten x Fehldruckquote" als Zuschlag auf die Kosten der guten Drucke; der dazu
 * passende Wert ist deshalb verschwendete Zeit geteilt durch gute Zeit (nicht durch die Gesamtzeit).
 */

export interface FailJob {
  printerId: string;
  result: string | null;
  minutes: number | null;
}

export interface FailStats {
  jobs: number; // Drucke mit bekanntem Ergebnis
  finished: number;
  failed: number;
  cancelled: number;
  unknown: number; // Ende nicht erkannt (z.B. Server-Neustart); fließt nicht ein
  hoursGood: number;
  hoursWasted: number;
  /** Anteil Fehldrucke an allen Drucken, in Prozent */
  percentByCount: number | null;
  /** Anteil der verschwendeten Druckzeit an der Gesamtzeit, in Prozent */
  percentByHours: number | null;
  /** Wert für das Kalkulationsfeld "Fehldruckquote": verschwendete geteilt durch gute Druckzeit, in Prozent */
  recommendedPercent: number | null;
  /** Ab dieser Zahl ausgewerteter Drucke ist die Zahl halbwegs belastbar */
  enoughData: boolean;
}

export const MIN_JOBS_FOR_RECOMMENDATION = 10;

const round1 = (n: number) => Math.round(n * 10) / 10;

export function computeFailStats(jobs: FailJob[]): FailStats {
  let finished = 0, failed = 0, cancelled = 0, unknown = 0, minutesGood = 0, minutesWasted = 0;
  for (const j of jobs) {
    const m = Math.max(0, j.minutes ?? 0);
    if (j.result === "FINISHED") { finished++; minutesGood += m; }
    else if (j.result === "FAILED") { failed++; minutesWasted += m; }
    else if (j.result === "CANCELLED") { cancelled++; minutesWasted += m; }
    else unknown++;
  }
  const known = finished + failed + cancelled;
  const total = minutesGood + minutesWasted;
  return {
    jobs: known,
    finished,
    failed,
    cancelled,
    unknown,
    hoursGood: round1(minutesGood / 60),
    hoursWasted: round1(minutesWasted / 60),
    percentByCount: known > 0 ? round1(((failed + cancelled) / known) * 100) : null,
    percentByHours: total > 0 ? round1((minutesWasted / total) * 100) : null,
    recommendedPercent: minutesGood > 0 ? round1((minutesWasted / minutesGood) * 100) : null,
    enoughData: known >= MIN_JOBS_FOR_RECOMMENDATION,
  };
}
