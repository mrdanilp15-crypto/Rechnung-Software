import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { LiveStatus } from "./PrinterLive";

/**
 * Druck an einen Bambu-Lab-Drucker senden: fertig geslicte 3MF-Datei (G-Code 3MF aus Bambu Studio) aus dem Belegarchiv wählen,
 * Platte und AMS-Fächer zuordnen. "Nur senden" legt die Datei auf der SD-Karte ab (Start am Drucker), "Senden und starten" startet
 * den Druck sofort - das verlangt die Bestätigung, dass die Druckplatte leer ist.
 */

interface FileRow {
  id: string;
  title: string;
  fileName: string;
  sizeBytes: number;
}
interface Filament {
  id: number;
  type: string | null;
  color: string | null;
  usedGrams: number | null;
}
interface Plate {
  index: number;
  predictionSeconds: number | null;
  weightGrams: number | null;
  filaments: Filament[];
}

const EXTERNAL = 254;
const minutes = (s: number) => {
  const m = Math.round(s / 60);
  return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} min` : `${m} min`;
};

export function PrintSendDialog({ printerId, printerName, status, onClose }: { printerId: string; printerName: string; status: LiveStatus; onClose: () => void }) {
  const [files, setFiles] = useState<FileRow[] | null>(null);
  const [docId, setDocId] = useState("");
  const [plates, setPlates] = useState<Plate[] | null>(null);
  const [plateIdx, setPlateIdx] = useState(1);
  const [assignment, setAssignment] = useState<Record<number, number>>({});
  const [useAms, setUseAms] = useState(true);
  const [clear, setClear] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const slots = status.ams.units.flatMap((u) => u.trays.filter((t) => t.type).map((t) => ({ value: t.amsSlot ?? u.id * 4 + t.slot, label: `AMS ${u.id + 1} · Fach ${t.slot + 1}: ${t.brand ?? t.type}`, type: t.type, color: t.color })));
  if (status.ams.external) slots.push({ value: EXTERNAL, label: `Externe Spule: ${status.ams.external.brand ?? status.ams.external.type}`, type: status.ams.external.type, color: status.ams.external.color });
  const ready = ["IDLE", "FINISH", "FAILED"].includes(status.state);

  useEffect(() => {
    api.get("/printers/print/files").then((r) => setFiles(r.data)).catch((e) => setError(e?.response?.data?.error ?? "Dateiliste nicht verfügbar."));
  }, []);

  async function choose(id: string) {
    setDocId(id);
    setPlates(null);
    setError(null);
    if (!id) return;
    try {
      const { data } = await api.get(`/printers/print/files/${id}/inspect`);
      setPlates(data.plates);
      const first: Plate = data.plates[0];
      setPlateIdx(first.index);
      prefill(first);
    } catch (e: any) {
      setError(e?.response?.data?.error ?? "Datei konnte nicht gelesen werden.");
    }
  }
  // Vorschlag: Fach mit gleichem Material, bevorzugt gleicher Farbe; jedes Fach nur einmal
  function prefill(plate: Plate) {
    const used = new Set<number>();
    const next: Record<number, number> = {};
    for (const f of plate.filaments) {
      const same = slots.filter((s) => s.type === f.type && !used.has(s.value));
      const pick = same.find((s) => s.color === f.color) ?? same[0];
      if (pick) {
        next[f.id] = pick.value;
        used.add(pick.value);
      }
    }
    setAssignment(next);
  }

  const plate = plates?.find((p) => p.index === plateIdx);
  const allAssigned = !useAms || !plate || plate.filaments.every((f) => assignment[f.id] !== undefined);

  async function send(mode: "upload" | "start") {
    setBusy(true);
    setError(null);
    try {
      const { data } = await api.post(`/printers/${printerId}/print`, { documentId: docId, plate: plateIdx, mode, useAms, assignment, confirmPlateClear: clear });
      setDone(mode === "start" ? `Druck gestartet (${data.fileName}). Der Fortschritt erscheint in der Druckerkarte.` : `Datei ${data.fileName} liegt auf dem Drucker. Am Drucker unter "SD-Karte" starten.`);
    } catch (e: any) {
      setError(e?.response?.data?.error ?? "Senden hat nicht geklappt.");
    } finally {
      setBusy(false);
    }
  }

  const sel = "w-full px-2 py-1.5 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm";
  return (
    <div className="fixed inset-0 z-[55] bg-black/50 flex items-center justify-center p-4" role="dialog" aria-label="Druck senden">
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl w-full max-w-lg max-h-[92vh] flex flex-col">
        <div className="flex items-center px-4 py-3 border-b border-slate-200 dark:border-slate-700">
          <h2 className="font-semibold flex-1">Druck an {printerName} senden</h2>
          <button onClick={onClose} className="px-3 py-1.5 rounded-lg text-sm bg-slate-100 dark:bg-slate-800" aria-label="Schließen">✕</button>
        </div>
        <div className="p-4 overflow-y-auto space-y-3 text-sm">
          {done ? (
            <p className="rounded-lg bg-green-50 text-green-800 dark:bg-green-900/30 dark:text-green-200 p-3">{done}</p>
          ) : (
            <>
              <p className="text-xs text-slate-500">Es geht nur eine fertig geslicte Datei: in Bambu Studio die Platte slicen und als <strong>G-Code 3MF</strong> exportieren, dann im Belegarchiv ablegen.</p>
              <label className="block">
                3MF-Datei aus dem Belegarchiv
                <select value={docId} onChange={(e) => choose(e.target.value)} className={sel}>
                  <option value="">- wählen -</option>
                  {files?.map((f) => <option key={f.id} value={f.id}>{f.title} ({f.fileName}, {(f.sizeBytes / 1048576).toFixed(1)} MB)</option>)}
                </select>
                {files && files.length === 0 && <span className="block text-xs text-slate-500 mt-1">Keine 3MF-Datei im Archiv. Lade sie unter Belegarchiv hoch.</span>}
              </label>

              {plates && plate && (
                <>
                  {plates.length > 1 && (
                    <label className="block">
                      Platte
                      <select value={plateIdx} onChange={(e) => { const i = Number(e.target.value); setPlateIdx(i); prefill(plates.find((p) => p.index === i)!); }} className={sel}>
                        {plates.map((p) => <option key={p.index} value={p.index}>Platte {p.index}{p.predictionSeconds ? ` · ${minutes(p.predictionSeconds)}` : ""}{p.weightGrams ? ` · ${Math.round(p.weightGrams)} g` : ""}</option>)}
                      </select>
                    </label>
                  )}
                  {plates.length === 1 && <p className="text-xs text-slate-500">Platte 1{plate.predictionSeconds ? ` · Dauer ca. ${minutes(plate.predictionSeconds)}` : ""}{plate.weightGrams ? ` · ${Math.round(plate.weightGrams)} g Filament` : ""}</p>}

                  <label className="flex items-center gap-2"><input type="checkbox" checked={useAms} onChange={(e) => setUseAms(e.target.checked)} /> Filament aus dem AMS / von der Spule zuordnen</label>
                  {useAms && (
                    <div className="space-y-2">
                      {plate.filaments.map((f) => (
                        <div key={f.id} className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full border border-slate-300 shrink-0" style={f.color ? { background: f.color } : undefined} />
                          <span className="w-28 shrink-0 text-xs">{f.type ?? "Filament"} {f.id}{f.usedGrams ? ` · ${Math.round(f.usedGrams)} g` : ""}</span>
                          <select value={assignment[f.id] ?? ""} onChange={(e) => setAssignment((a) => ({ ...a, [f.id]: Number(e.target.value) }))} className={sel}>
                            <option value="">- Fach wählen -</option>
                            {slots.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                          </select>
                        </div>
                      ))}
                      {plate.filaments.length === 0 && <p className="text-xs text-slate-500">In der Datei stehen keine Filamentangaben; der Drucker nimmt das eingestellte Filament.</p>}
                    </div>
                  )}

                  <label className="flex items-start gap-2"><input type="checkbox" className="mt-0.5" checked={clear} onChange={(e) => setClear(e.target.checked)} /> <span>Die Druckplatte ist leer und sauber (nötig zum Starten - sonst kann der Druckkopf in das alte Teil fahren).</span></label>
                  {!ready && <p className="text-xs text-amber-700 dark:text-amber-400">Der Drucker ist gerade nicht bereit ({status.stateLabel}) - Starten ist nur im Zustand "Bereit" oder "Fertig" möglich. Senden geht trotzdem.</p>}
                </>
              )}
              {error && <p className="text-red-600">{error}</p>}
            </>
          )}
        </div>
        <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-700 flex flex-wrap gap-2 justify-end">
          {!done && (
            <>
              <button disabled={!plate || busy} onClick={() => send("upload")} className="px-4 py-2 rounded-lg text-sm bg-slate-200 dark:bg-slate-700 disabled:opacity-50">Nur senden (Start am Drucker)</button>
              <button disabled={!plate || busy || !clear || !ready || !allAssigned} onClick={() => send("start")} className="px-4 py-2 rounded-lg text-sm bg-brand text-white disabled:opacity-50">{busy ? "Wird gesendet ..." : "Senden und starten"}</button>
            </>
          )}
          {done && <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm bg-brand text-white">Schließen</button>}
        </div>
      </div>
    </div>
  );
}
