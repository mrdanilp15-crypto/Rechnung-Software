import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { LiveStatus } from "./PrinterLive";
import { OrderSelect } from "./OrderSelect";

import { HelpTip } from "./HelpTip";
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
  createdAt?: string;
  products?: { id: string; name: string; revision: number; isCurrent: boolean }[];
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

/** Grober deutscher Farbname aus dem Hex-Wert (damit man im AMS-Fach die Farbe auch ohne Farbpunkt erkennt). */
export function colorName(hex: string | null): string {
  const m = hex ? /^#?([0-9a-f]{6})/i.exec(hex) : null;
  if (!m) return "";
  const n = parseInt(m[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min, l = (max + min) / 2;
  if (d < 0.08) return l > 0.85 ? "Weiß" : l < 0.18 ? "Schwarz" : l < 0.4 ? "Dunkelgrau" : "Grau";
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  const light = l > 0.75 ? "Hell" : l < 0.3 ? "Dunkel" : "";
  const name = h < 15 || h >= 345 ? "rot" : h < 40 ? "orange" : h < 65 ? "gelb" : h < 160 ? "grün" : h < 200 ? "türkis" : h < 255 ? "blau" : h < 310 ? "lila" : "pink";
  if (light === "Hell" && name === "rot") return "Rosa";
  return light ? `${light}${name}` : name[0].toUpperCase() + name.slice(1);
}
const minutes = (s: number) => {
  const m = Math.round(s / 60);
  return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} min` : `${m} min`;
};

export function PrintSendDialog({ printerId, printerName, status, onClose, initialDocId, initialOrderId }: { printerId: string; printerName: string; status: LiveStatus; onClose: () => void; initialDocId?: string; initialOrderId?: string }) {
  const [files, setFiles] = useState<FileRow[] | null>(null);
  const [docId, setDocId] = useState("");
  const [plates, setPlates] = useState<Plate[] | null>(null);
  const [plateIdx, setPlateIdx] = useState(1);
  const [assignment, setAssignment] = useState<Record<number, number>>({});
  const [useAms, setUseAms] = useState(true);
  const [clear, setClear] = useState(false);
  const [orderId, setOrderId] = useState(initialOrderId ?? "");
  const [q, setQ] = useState("");
  const [noThumb, setNoThumb] = useState(false);
  const [mappings, setMappings] = useState<{ slot: number; material: { name: string } }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  type Slot = { value: number; label: string; type: string | null; color: string | null };
  const describe = (where: string, t: { brand: string | null; type: string | null; color: string | null; remainPercent?: number | null }, slotNo?: number) => {
    const mat = slotNo !== undefined ? mappings.find((m) => m.slot === slotNo)?.material.name : undefined;
    return `${where}: ${[t.brand ?? t.type, colorName(t.color), t.remainPercent !== null && t.remainPercent !== undefined ? `${Math.round(t.remainPercent)} %` : ""].filter(Boolean).join(" · ")}${mat ? ` → ${mat}` : ""}`;
  };
  const slots: Slot[] = status.ams.units.flatMap((u) => u.trays.filter((t) => t.type).map((t) => { const no = t.amsSlot ?? u.id * 4 + t.slot; return { value: no, label: describe(`AMS ${u.id + 1} · Fach ${t.slot + 1}`, t, no), type: t.type, color: t.color }; }));
  if (status.ams.external) slots.push({ value: EXTERNAL, label: describe("Externe Spule", status.ams.external), type: status.ams.external.type, color: status.ams.external.color });
  const ready = ["IDLE", "FINISH", "FAILED"].includes(status.state);

  useEffect(() => {
    api.get(`/printers/${printerId}/ams-slots`).then((r) => setMappings(r.data)).catch(() => {});
    api.get("/printers/print/files").then((r) => { setFiles(r.data); if (initialDocId) void choose(initialDocId); }).catch((e) => setError(e?.response?.data?.error ?? "Dateiliste nicht verfügbar."));
  }, []);

  async function choose(id: string) {
    setDocId(id);
    setNoThumb(false);
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

  const chosen = files?.find((f) => f.id === docId);
  // Anzeigename: Produkt (Version) vor dem Dateititel, damit sofort klar ist, welches Teil gedruckt wird
  const label = (f: FileRow) => (f.products && f.products.length > 0 ? `${f.products.map((p) => p.name).join(", ")} · Version ${f.products[0].revision}` : f.title);
  const matches = (f: FileRow) => {
    const t = q.trim().toLowerCase();
    return !t || [f.title, f.fileName, ...(f.products ?? []).map((p) => p.name)].some((x) => x.toLowerCase().includes(t));
  };
  const plate = plates?.find((p) => p.index === plateIdx);
  const allAssigned = !useAms || !plate || plate.filaments.every((f) => assignment[f.id] !== undefined);

  async function send(mode: "upload" | "start") {
    setBusy(true);
    setError(null);
    try {
      const { data } = await api.post(`/printers/${printerId}/print`, { documentId: docId, plate: plateIdx, mode, useAms, assignment, confirmPlateClear: clear, orderConfirmationId: orderId || null, noOrder: !orderId });
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
          <h2 className="font-semibold flex-1">Druck an {printerName} senden<HelpTip topic="print-start" className="ml-2" /></h2>
          <button onClick={onClose} className="px-3 py-1.5 rounded-lg text-sm bg-slate-100 dark:bg-slate-800" aria-label="Schließen">✕</button>
        </div>
        <div className="p-4 overflow-y-auto space-y-3 text-sm">
          {done ? (
            <p className="rounded-lg bg-green-50 text-green-800 dark:bg-green-900/30 dark:text-green-200 p-3">{done}</p>
          ) : (
            <>
              <p className="text-xs text-slate-500">Es geht nur eine fertig geslicte Datei: in Bambu Studio die Platte slicen und als <strong>G-Code 3MF</strong> exportieren, dann im Belegarchiv ablegen.</p>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="flex-1">Welche Datei soll gedruckt werden?</span>
                  {docId && <button type="button" onClick={() => { setDocId(""); setPlates(null); }} className="text-xs text-brand hover:underline">andere wählen</button>}
                </div>
                {docId && chosen ? (
                  <div className="rounded-lg border border-brand/40 bg-brand/5 px-3 py-2">
                    <div className="font-medium">{label(chosen)}</div>
                    <div className="text-xs text-slate-500">{chosen.fileName} · {(chosen.sizeBytes / 1048576).toFixed(1)} MB</div>
                  </div>
                ) : (
                  <>
                    <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Suchen (Produkt, Name, Datei) ..." className={sel + " mb-2"} />
                    <ul className="max-h-60 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-800">
                      {(files ?? []).filter(matches).map((f) => (
                        <li key={f.id}>
                          <button type="button" onClick={() => choose(f.id)} className="w-full text-left px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800">
                            <span className="block font-medium truncate">{label(f)}</span>
                            <span className="block text-xs text-slate-500 truncate">
                              {f.products?.some((p) => p.isCurrent) && <span className="mr-1.5 px-1.5 py-0.5 rounded bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300">aktuelle Version</span>}
                              {f.fileName} · {(f.sizeBytes / 1048576).toFixed(1)} MB{f.createdAt ? ` · ${new Date(f.createdAt).toLocaleDateString("de-DE")}` : ""}
                            </span>
                          </button>
                        </li>
                      ))}
                      {files && files.filter(matches).length === 0 && <li className="px-3 py-3 text-xs text-slate-500">{files.length === 0 ? "Keine 3MF-Datei im Archiv. Lade sie unter Belegarchiv hoch (oder direkt beim Produkt unter Dateien)." : "Nichts gefunden."}</li>}
                    </ul>
                    <p className="text-xs text-slate-500 mt-1">Dateien, die einem Produkt zugeordnet sind, stehen oben und tragen den Produktnamen.</p>
                  </>
                )}
              </div>

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
                  {!noThumb && <img src={`/api/printers/print/files/${docId}/thumbnail?plate=${plateIdx}`} alt="Vorschau der Platte" onError={() => setNoThumb(true)} className="h-40 w-full rounded-lg bg-white object-contain ring-1 ring-slate-200 dark:ring-slate-700" />}
                  {plates.length === 1 && <p className="text-xs text-slate-500">Platte 1{plate.predictionSeconds ? ` · Dauer ca. ${minutes(plate.predictionSeconds)}` : ""}{plate.weightGrams ? ` · ${Math.round(plate.weightGrams)} g Filament` : ""}</p>}

                  <label className="flex items-center gap-2"><input type="checkbox" checked={useAms} onChange={(e) => setUseAms(e.target.checked)} /> Filament aus dem AMS / von der Spule zuordnen</label>
                  {useAms && (
                    <div className="space-y-2">
                      {plate.filaments.map((f) => (
                        <div key={f.id} className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full border border-slate-300 shrink-0" style={f.color ? { background: f.color } : undefined} />
                          <span className="w-28 shrink-0 text-xs">{f.type ?? "Filament"} {f.id}{f.color ? ` · ${colorName(f.color)}` : ""}{f.usedGrams ? ` · ${Math.round(f.usedGrams)} g` : ""}</span>
                          <span className="w-5 h-5 rounded-full border border-slate-300 shrink-0" title={colorName(slots.find((x) => x.value === assignment[f.id])?.color ?? null) || "Fach wählen"} style={slots.find((x) => x.value === assignment[f.id])?.color ? { background: slots.find((x) => x.value === assignment[f.id])!.color! } : undefined} />
                          <select value={assignment[f.id] ?? ""} onChange={(e) => setAssignment((a) => ({ ...a, [f.id]: Number(e.target.value) }))} className={sel}>
                            <option value="">- Fach wählen -</option>
                            {slots.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                          </select>
                        </div>
                      ))}
                      {plate.filaments.length === 0 && <p className="text-xs text-slate-500">In der Datei stehen keine Filamentangaben; der Drucker nimmt das eingestellte Filament.</p>}
                      {plate.filaments.some((f) => f.usedGrams) && <p className="text-xs text-slate-500">Der Verbrauch laut Slicer wird nach dem Druck vom Material abgebucht, das dem gewählten Fach zugeordnet ist (Spulen ohne Chip). Bei Abbruch anteilig nach Fortschritt.</p>}
                    </div>
                  )}

                  <label className="block">
                    Für Auftrag (optional)
                    <OrderSelect value={orderId} onChange={setOrderId} className={sel} emptyLabel="Kein Auftrag (Lagerproduktion)" />
                    <span className="block text-xs text-slate-500 mt-1">Zeit und Material des Drucks gehen dann in die tatsächlichen Kosten dieses Auftrags ein (Produktion → Kosten).</span>
                  </label>

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
