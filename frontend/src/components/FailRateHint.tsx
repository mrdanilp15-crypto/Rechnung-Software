import { useEffect, useState } from "react";
import { api } from "../api/client";

interface Stats {
  jobs: number;
  finished: number;
  failed: number;
  cancelled: number;
  hoursGood: number;
  hoursWasted: number;
  percentByCount: number | null;
  percentByHours: number | null;
  recommendedPercent: number | null;
  enoughData: boolean;
}

const nf = (n: number) => new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 }).format(n);

/** Hinweis unter dem Feld "Fehldruckquote": Was die erkannten Druckaufträge der letzten 90 Tage tatsächlich ergeben, mit Übernehmen-Knopf. */
export function FailRateHint({ current, onApply }: { current: number; onApply: (value: number) => void }) {
  const [stats, setStats] = useState<Stats | null | undefined>(undefined);
  useEffect(() => {
    api.get("/printers/fail-stats", { params: { days: 90 } }).then((r) => setStats(r.data.total)).catch(() => setStats(null));
  }, []);
  if (stats === undefined) return null;
  if (stats === null || stats.jobs === 0) {
    return <p className="text-xs text-slate-500 -mt-1">Gemessene Quote: Noch keine Drucke erfasst. Sie erscheint hier, sobald Drucker mit Live-Verbindung Druckaufträge erkennen.</p>;
  }
  const rec = stats.recommendedPercent;
  return (
    <div className="text-xs rounded-lg bg-slate-50 dark:bg-slate-900/40 p-2 -mt-1 space-y-1">
      <div>
        <strong>Gemessen (letzte 90 Tage):</strong> {stats.jobs} Drucke, davon {stats.failed} fehlgeschlagen und {stats.cancelled} abgebrochen
        {stats.percentByCount !== null ? ` (${nf(stats.percentByCount)} % der Drucke` : ""}{stats.percentByHours !== null ? `, ${nf(stats.percentByHours)} % der Druckzeit)` : stats.percentByCount !== null ? ")" : ""}.
        Verschwendete Druckzeit: {nf(stats.hoursWasted)} h, gute Druckzeit: {nf(stats.hoursGood)} h.
      </div>
      {rec !== null ? (
        <div className="flex flex-wrap items-center gap-2">
          <span>Passender Wert für dieses Feld: <strong>{nf(rec)} %</strong> (verschwendete geteilt durch gute Druckzeit).</span>
          {Math.abs(rec - current) >= 0.1 && <button type="button" onClick={() => onApply(rec)} className="px-2 py-1 rounded bg-brand text-white">Übernehmen</button>}
        </div>
      ) : (
        <div>Noch keine erfolgreichen Drucke, daher kein Vorschlag.</div>
      )}
      {!stats.enoughData && <div className="text-amber-700 dark:text-amber-400">Bisher nur {stats.jobs} Drucke - die Zahl ist noch wenig aussagekräftig.</div>}
      <div className="text-slate-500">Abgebrochene Drucke zählen als Fehldruck, auch wenn du sie bewusst gestoppt hast. Drucke ohne erkanntes Ende fließen nicht ein.</div>
    </div>
  );
}
