import { useEffect, useState } from "react";
import { api } from "../api/client";
import { colorName } from "./PrintSendDialog";

/**
 * Materialverbrauch eines beendeten Drucks festlegen/korrigieren - vor allem für Drucke aus Bambu Studio: die AMS-Messung kennt nur ganze
 * Prozent (bei 1-kg-Spulen ca. 10 g) und nur Fächer mit Zuordnung. Passt der Druckname zu einer 3MF im Archiv, wird deren Slicer-Angabe vorgeschlagen.
 * Der Unterschied zum bisher Gebuchten geht in den Materialbestand.
 */

interface Material {
  id: string;
  name: string;
  unit: string;
}
interface Row {
  materialId: string;
  grams: string;
}
interface Suggestion {
  document: { id: string; title: string; fileName: string } | null;
  plates: { index: number; weightGrams: number | null; filaments: { id: number; type: string | null; color: string | null; usedGrams: number | null }[] }[];
  note?: string;
}

const sel = "px-2 py-1.5 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm";

export function JobUsageDialog({ jobId, jobName, current, onClose, onSaved }: { jobId: string; jobName: string | null; current: { materialId: string; name: string; grams: number }[] | null | undefined; onClose: () => void; onSaved: () => void }) {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [rows, setRows] = useState<Row[]>((current ?? []).map((u) => ({ materialId: u.materialId, grams: String(Math.round(u.grams * 10) / 10) })));
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [plateIdx, setPlateIdx] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get("/materials").then((r) => setMaterials((r.data as Material[]).filter((m) => ["g", "gramm", "kg"].includes(m.unit.trim().toLowerCase())))).catch(() => {});
    api.get(`/printers/jobs/${jobId}/usage-suggestion`).then((r) => { setSuggestion(r.data); setPlateIdx(r.data.plates?.[0]?.index ?? null); }).catch(() => {});
  }, [jobId]);

  // Material zu einem Slicer-Filament raten: Name enthält die Sorte (PLA, PETG ...), bevorzugt auch die Farbe
  function guess(f: { type: string | null; color: string | null }): string {
    const type = (f.type ?? "").toLowerCase();
    const col = colorName(f.color).toLowerCase();
    const sameType = materials.filter((m) => type && m.name.toLowerCase().includes(type));
    return (sameType.find((m) => col && m.name.toLowerCase().includes(col)) ?? sameType[0] ?? materials[0])?.id ?? "";
  }
  const plate = suggestion?.plates.find((p) => p.index === plateIdx);
  function applySuggestion() {
    if (!plate) return;
    setRows(plate.filaments.filter((f) => f.usedGrams).map((f) => ({ materialId: guess(f), grams: String(Math.round((f.usedGrams ?? 0) * 10) / 10) })));
  }

  const parsed = rows.map((r) => ({ materialId: r.materialId, grams: parseFloat(r.grams.replace(",", ".")) })).filter((r) => r.materialId && r.grams > 0);
  const total = parsed.reduce((a, r) => a + r.grams, 0);
  const oldTotal = (current ?? []).reduce((a, u) => a + u.grams, 0);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const { data } = await api.put(`/printers/jobs/${jobId}/usage`, { usage: parsed });
      if (data.stockSkipped?.length) window.alert(`Der Bestand von ${data.stockSkipped.join(", ")} wurde nicht angepasst (Einheit weder g noch kg).`);
      onSaved();
    } catch (e: any) {
      setError(e?.response?.data?.error ?? "Speichern hat nicht geklappt.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[55] bg-black/50 flex items-center justify-center p-4" role="dialog" aria-label="Materialverbrauch festlegen">
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl w-full max-w-lg max-h-[92vh] flex flex-col">
        <div className="flex items-center px-4 py-3 border-b border-slate-200 dark:border-slate-700">
          <h2 className="font-semibold flex-1 truncate">Material für „{jobName ?? "Druck"}“</h2>
          <button onClick={onClose} className="px-3 py-1.5 rounded-lg text-sm bg-slate-100 dark:bg-slate-800" aria-label="Schließen">✕</button>
        </div>
        <div className="p-4 overflow-y-auto space-y-3 text-sm">
          <p className="text-xs text-slate-500">Hier legst du fest, wie viel von welchem Material dieser Druck gebraucht hat. Das zählt für die Kosten des Auftrags und den Materialbestand: Der Unterschied zum bisher Gebuchten wird im Bestand ausgeglichen.</p>

          {suggestion?.document && (
            <div className="rounded-lg border border-brand/30 bg-brand/5 p-3 space-y-2">
              <p><strong>Passende Datei im Archiv:</strong> {suggestion.document.fileName}</p>
              {plate ? (
                <>
                  {suggestion.plates.length > 1 && (
                    <select value={plateIdx ?? ""} onChange={(e) => setPlateIdx(Number(e.target.value))} className={sel}>
                      {suggestion.plates.map((p) => <option key={p.index} value={p.index}>Platte {p.index}{p.weightGrams ? ` · ${Math.round(p.weightGrams)} g` : ""}</option>)}
                    </select>
                  )}
                  <p className="text-xs text-slate-500">Laut Slicer: {plate.filaments.filter((f) => f.usedGrams).map((f) => `${f.type ?? "Filament"} ${colorName(f.color)} ${Math.round((f.usedGrams ?? 0) * 10) / 10} g`).join(" · ") || "keine Angaben"}</p>
                  <button type="button" onClick={applySuggestion} className="px-3 py-1.5 rounded-lg text-sm bg-brand text-white">Werte übernehmen</button>
                  <p className="text-xs text-slate-500">Das Material wird nach Sorte und Farbe geraten - bitte unten prüfen. Spülmenge beim Farbwechsel ist im Slicer-Wert nicht enthalten.</p>
                </>
              ) : (
                <p className="text-xs text-slate-500">{suggestion.note ?? "In der Datei stehen keine Verbrauchsangaben."}</p>
              )}
            </div>
          )}

          <div className="space-y-2">
            {rows.map((r, i) => (
              <div key={i} className="flex items-center gap-2">
                <select value={r.materialId} onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, materialId: e.target.value } : x)))} className={sel + " min-w-0 flex-1"}>
                  <option value="">- Material wählen -</option>
                  {materials.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
                <input type="number" min="0" step="0.1" inputMode="decimal" value={r.grams} onFocus={(e) => e.target.select()} onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, grams: e.target.value } : x)))} className={sel + " w-24 text-right"} aria-label="Gramm" />
                <span className="text-xs text-slate-500">g</span>
                <button type="button" onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))} className="text-red-600 text-xs hover:underline">entfernen</button>
              </div>
            ))}
            <button type="button" onClick={() => setRows((rs) => [...rs, { materialId: materials[0]?.id ?? "", grams: "" }])} className="text-brand text-sm hover:underline">+ Material hinzufügen</button>
            {materials.length === 0 && <p className="text-xs text-amber-600">Es gibt kein Material in g oder kg. Lege es zuerst unter Material an.</p>}
          </div>

          <p className="text-xs text-slate-500">
            Summe {Math.round(total * 10) / 10} g{current && current.length > 0 ? ` (bisher gebucht: ${Math.round(oldTotal * 10) / 10} g)` : ""}.{" "}
            {Math.abs(total - oldTotal) >= 0.05 ? `Der Bestand wird um ${Math.abs(Math.round((total - oldTotal) * 10) / 10)} g ${total > oldTotal ? "verringert" : "erhöht"} (je nach Material).` : ""}
          </p>
          {error && <p className="text-red-600">{error}</p>}
        </div>
        <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-700 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm bg-slate-200 dark:bg-slate-700">Abbrechen</button>
          <button disabled={busy} onClick={save} className="px-4 py-2 rounded-lg text-sm bg-brand text-white disabled:opacity-50">{busy ? "Speichert ..." : "Speichern"}</button>
        </div>
      </div>
    </div>
  );
}
