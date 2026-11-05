import { useCallback, useEffect, useState } from "react";
import { api } from "../api/client";
import { PdfLink } from "./PdfLink";

/**
 * Dateien eines Produkts mit Versionen (Revision 1, 2, 3 ...): Neue Version hochladen oder eine Datei aus dem Belegarchiv zuordnen,
 * eine Version als aktuelle Druckdatei markieren und aus einer fertig geslicten 3MF Druckzeit und Materialverbrauch für die Kalkulation übernehmen.
 */

interface PFile {
  id: string;
  revision: number;
  note: string | null;
  isCurrent: boolean;
  addedAt: string;
  documentId: string;
  title: string;
  fileName: string;
  mimeType?: string;
  sizeBytes: number;
}
interface Candidate {
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
  objectCount: number | null;
}
interface Material {
  id: string;
  name: string;
  unit: string;
}

export interface Applied3mf {
  printMinutes: number;
  pieces: number | null;
  rows: { materialId: string; quantity: number }[];
}

const fmtSize = (b: number) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("de-DE");
const minutesText = (s: number) => {
  const m = Math.round(s / 60);
  return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} min` : `${m} min`;
};
const is3mf = (name: string) => /\.3mf$/i.test(name);

/** Gramm in die Einheit des Materials umrechnen (g oder kg); null, wenn nicht möglich */
export function gramsInUnit(grams: number, unit: string): number | null {
  const u = unit.trim().toLowerCase();
  if (u === "g" || u === "gramm") return grams;
  if (u === "kg") return grams / 1000;
  return null;
}
/** Vorschlag: erstes Material, dessen Name die Filamentart (PLA, PETG ...) enthält */
export function guessMaterial(type: string | null, materials: Material[]): string {
  if (!type) return "";
  const t = type.toLowerCase();
  return materials.find((m) => m.name.toLowerCase().includes(t))?.id ?? "";
}

const sel = "px-2 py-1.5 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm";

export function ProductFiles({ productId, productName, materials, onApply, imageDocumentId, onSetImage }: { productId: string; productName: string; materials: Material[]; onApply: (r: Applied3mf) => void; imageDocumentId?: string | null; onSetImage?: (docId: string | null) => void }) {
  const [files, setFiles] = useState<PFile[] | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [picking, setPicking] = useState(false);
  const [q, setQ] = useState("");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [analysis, setAnalysis] = useState<{ fileId: string; fileName: string; plates: Plate[] } | null>(null);
  const [plateIdx, setPlateIdx] = useState(1);
  const [mapping, setMapping] = useState<Record<number, string>>({});
  const [usePieces, setUsePieces] = useState(false);

  const load = useCallback(() => {
    api.get(`/products/${productId}/files`).then((r) => setFiles(r.data)).catch(() => setFiles([]));
  }, [productId]);
  useEffect(load, [load]);

  useEffect(() => {
    if (!picking) return;
    const t = setTimeout(() => api.get(`/products/${productId}/files/candidates`, { params: { q } }).then((r) => setCandidates(r.data)).catch(() => setCandidates([])), 250);
    return () => clearTimeout(t);
  }, [picking, q, productId]);

  const fail = (e: any, fallback: string) => setMsg({ ok: false, text: e?.response?.data?.error ?? fallback });

  async function attach(documentId: string) {
    await api.post(`/products/${productId}/files`, { documentId, note: note || null, makeCurrent: true });
    setNote("");
    setPicking(false);
    load();
  }

  async function upload(file: File) {
    setBusy(true);
    setMsg(null);
    try {
      const fd = new FormData();
      fd.append("files", file);
      fd.append("category", "DESIGN");
      fd.append("title", `${productName || "Produkt"} - ${file.name}`.slice(0, 200));
      fd.append("tags", "produkt");
      const { data } = await api.post("/archive", fd, { headers: { "Content-Type": "multipart/form-data" } });
      if (data.created.length) {
        await attach(data.created[0].id);
        setMsg({ ok: true, text: `${file.name} als neue Version abgelegt.` });
      } else if (data.skipped.length) {
        setMsg({ ok: false, text: `Diese Datei liegt schon im Archiv${data.skipped[0].existingTitle ? ` (als "${data.skipped[0].existingTitle}")` : ""}. Wähle sie über "Aus dem Archiv zuordnen".` });
      } else {
        setMsg({ ok: false, text: data.rejected[0]?.reason ?? "Datei wurde nicht angenommen." });
      }
    } catch (e) {
      fail(e, "Hochladen hat nicht geklappt.");
    } finally {
      setBusy(false);
    }
  }

  async function setCurrent(f: PFile) {
    try {
      await api.patch(`/products/${productId}/files/${f.id}`, { isCurrent: true });
      load();
    } catch (e) {
      fail(e, "Das hat nicht geklappt.");
    }
  }
  async function editNote(f: PFile) {
    const text = window.prompt(`Änderungsnotiz zu Version ${f.revision}:`, f.note ?? "");
    if (text === null) return;
    try {
      await api.patch(`/products/${productId}/files/${f.id}`, { note: text });
      load();
    } catch (e) {
      fail(e, "Notiz konnte nicht gespeichert werden.");
    }
  }
  async function unlink(f: PFile) {
    if (!window.confirm(`Version ${f.revision} (${f.fileName}) vom Produkt lösen? Die Datei bleibt im Belegarchiv.`)) return;
    try {
      await api.delete(`/products/${productId}/files/${f.id}`);
      if (analysis?.fileId === f.id) setAnalysis(null);
      load();
    } catch (e) {
      fail(e, "Das hat nicht geklappt.");
    }
  }

  async function analyse(f: PFile) {
    setMsg(null);
    try {
      const { data } = await api.get(`/products/${productId}/files/${f.id}/analysis`);
      const plates: Plate[] = data.plates;
      setAnalysis({ fileId: f.id, fileName: f.fileName, plates });
      setPlateIdx(plates[0].index);
      setMapping(prefill(plates[0]));
      setUsePieces(false);
    } catch (e) {
      setAnalysis(null);
      fail(e, "Die Datei konnte nicht ausgewertet werden.");
    }
  }
  function prefill(p: Plate): Record<number, string> {
    return Object.fromEntries(p.filaments.map((f) => [f.id, guessMaterial(f.type, materials)]));
  }

  const plate = analysis?.plates.find((p) => p.index === plateIdx);

  function apply() {
    if (!plate || plate.predictionSeconds === null) return;
    const rows: { materialId: string; quantity: number }[] = [];
    for (const f of plate.filaments) {
      const materialId = mapping[f.id];
      const material = materials.find((m) => m.id === materialId);
      if (!material || !f.usedGrams) continue;
      const qty = gramsInUnit(f.usedGrams, material.unit);
      if (qty === null) continue;
      const hit = rows.find((r) => r.materialId === materialId);
      if (hit) hit.quantity += qty;
      else rows.push({ materialId, quantity: qty });
    }
    onApply({ printMinutes: Math.round(plate.predictionSeconds / 60), pieces: usePieces && plate.objectCount && plate.objectCount > 1 ? plate.objectCount : null, rows: rows.map((r) => ({ ...r, quantity: Math.round(r.quantity * 10000) / 10000 })) });
    setMsg({ ok: true, text: "Übernommen: Druckzeit und Materialverbrauch stehen unten im Formular - bitte prüfen und speichern." });
    setAnalysis(null);
  }

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium">Dateien und Versionen</h3>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Änderungsnotiz (optional)" className={`${sel} w-52`} />
          <label className={`px-3 py-1.5 rounded bg-brand text-white cursor-pointer ${busy ? "opacity-50 pointer-events-none" : ""}`}>
            {busy ? "Wird hochgeladen ..." : "Neue Version hochladen"}
            <input type="file" className="hidden" accept=".stl,.3mf,.step,.stp,.obj,.gcode,.png,.jpg,.jpeg,.webp,.pdf" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) upload(f); }} />
          </label>
          <button type="button" onClick={() => setPicking((v) => !v)} className="px-3 py-1.5 rounded bg-slate-200 dark:bg-slate-700">Aus dem Archiv zuordnen</button>
        </div>
      </div>
      <p className="text-xs text-slate-500">Jede hochgeladene Datei wird eine neue Version (Rev 1, 2, 3 ...) und ist dann die aktuelle Druckdatei. Die Dateien liegen im Belegarchiv (STL, 3MF, STEP, Bilder, PDF).</p>

      {msg && <p className={`text-xs ${msg.ok ? "text-green-600" : "text-red-600"}`}>{msg.text}</p>}

      {picking && (
        <div className="rounded bg-slate-50 dark:bg-slate-900/40 p-2 space-y-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Im Archiv suchen (Titel oder Dateiname)" className={`${sel} w-full`} />
          <ul className="max-h-48 overflow-y-auto divide-y divide-slate-200 dark:divide-slate-700 text-xs">
            {candidates.map((c) => (
              <li key={c.id} className="py-1.5 flex items-center justify-between gap-2">
                <span className="truncate">{c.title} <span className="text-slate-500">· {c.fileName} · {fmtSize(c.sizeBytes)}</span></span>
                <button type="button" onClick={() => attach(c.id).catch((e) => fail(e, "Zuordnen hat nicht geklappt."))} className="text-brand hover:underline shrink-0">Zuordnen</button>
              </li>
            ))}
            {candidates.length === 0 && <li className="py-2 text-slate-500">Keine passenden Dokumente im Archiv.</li>}
          </ul>
        </div>
      )}

      {files === null ? (
        <p className="text-xs text-slate-500">Wird geladen ...</p>
      ) : files.length === 0 ? (
        <p className="text-xs text-slate-500">Noch keine Datei zugeordnet.</p>
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-slate-700 text-sm">
          {files.map((f) => (
            <li key={f.id} className="py-2 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700">Rev {f.revision}</span>
                {f.isCurrent && <span className="text-xs px-1.5 py-0.5 rounded bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300">aktuell</span>}
                {f.mimeType?.startsWith("image/") && <img src={`/api/archive/${f.documentId}/file`} alt="" className="w-8 h-8 rounded object-cover" loading="lazy" />}
                <span className="font-medium truncate min-w-0">{f.fileName}</span>
                <span className="text-xs text-slate-500">{fmtSize(f.sizeBytes)} · {fmtDate(f.addedAt)}</span>
              </div>
              {f.note && <p className="text-xs text-slate-500">{f.note}</p>}
              <div className="flex flex-wrap gap-3 text-xs">
                <PdfLink url={`/archive/${f.documentId}/file?download=1`} filename={f.fileName} download className="text-brand hover:underline">Herunterladen</PdfLink>
                {is3mf(f.fileName) && <button type="button" onClick={() => analyse(f)} className="text-brand hover:underline">Werte aus 3MF übernehmen</button>}
                {onSetImage && f.mimeType?.startsWith("image/") && (imageDocumentId === f.documentId ? <button type="button" onClick={() => onSetImage(null)} className="text-green-600 hover:underline">Produktbild (entfernen)</button> : <button type="button" onClick={() => onSetImage(f.documentId)} className="text-brand hover:underline">Als Produktbild</button>)}
                {!f.isCurrent && <button type="button" onClick={() => setCurrent(f)} className="text-brand hover:underline">Als aktuell setzen</button>}
                <button type="button" onClick={() => editNote(f)} className="text-brand hover:underline">Notiz</button>
                <button type="button" onClick={() => unlink(f)} className="text-red-600 hover:underline">Lösen</button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {analysis && plate && (
        <div className="rounded bg-slate-50 dark:bg-slate-900/40 p-3 space-y-2 text-sm">
          <div className="font-medium">Aus {analysis.fileName}</div>
          {analysis.plates.length > 1 && (
            <label className="block text-xs">
              Platte
              <select value={plateIdx} onChange={(e) => { const i = Number(e.target.value); setPlateIdx(i); setMapping(prefill(analysis.plates.find((p) => p.index === i)!)); }} className={`${sel} ml-2`}>
                {analysis.plates.map((p) => <option key={p.index} value={p.index}>Platte {p.index}{p.predictionSeconds ? ` · ${minutesText(p.predictionSeconds)}` : ""}</option>)}
              </select>
            </label>
          )}
          <p className="text-xs text-slate-500">
            Druckzeit {plate.predictionSeconds !== null ? minutesText(plate.predictionSeconds) : "nicht angegeben"}
            {plate.weightGrams ? ` · ${Math.round(plate.weightGrams)} g Filament` : ""}
            {plate.objectCount ? ` · ${plate.objectCount} Objekt${plate.objectCount === 1 ? "" : "e"} auf der Platte` : ""}
          </p>
          {plate.filaments.map((f) => (
            <div key={f.id} className="flex items-center gap-2 text-xs">
              <span className="w-4 h-4 rounded-full border border-slate-300 shrink-0" style={f.color ? { background: f.color } : undefined} />
              <span className="w-28 shrink-0">{f.type ?? "Filament"} {f.id}{f.usedGrams ? ` · ${Math.round(f.usedGrams * 10) / 10} g` : ""}</span>
              <select value={mapping[f.id] ?? ""} onChange={(e) => setMapping((m) => ({ ...m, [f.id]: e.target.value }))} className={`${sel} flex-1 min-w-0`}>
                <option value="">- nicht übernehmen -</option>
                {materials.map((m) => <option key={m.id} value={m.id} disabled={gramsInUnit(1, m.unit) === null}>{m.name}{gramsInUnit(1, m.unit) === null ? " (Einheit nicht g/kg)" : ""}</option>)}
              </select>
            </div>
          ))}
          {plate.objectCount && plate.objectCount > 1 && (
            <label className="flex items-start gap-2 text-xs"><input type="checkbox" className="mt-0.5" checked={usePieces} onChange={(e) => setUsePieces(e.target.checked)} /> Stück pro Druckplatte auf {plate.objectCount} setzen (nur wenn es {plate.objectCount} gleiche Teile sind - bei verschiedenen Teilen nicht anhaken)</label>
          )}
          <p className="text-xs text-slate-500">Das ersetzt Druckzeit und Materialverbrauch im Formular durch die Werte des Slicers (für die ganze Platte, inklusive Stützen und Spülmenge). Danach prüfen und speichern.</p>
          <div className="flex gap-2">
            <button type="button" onClick={apply} disabled={plate.predictionSeconds === null} className="px-3 py-1.5 rounded bg-brand text-white disabled:opacity-50">In die Kalkulation übernehmen</button>
            <button type="button" onClick={() => setAnalysis(null)} className="px-3 py-1.5 rounded bg-slate-200 dark:bg-slate-700">Abbrechen</button>
          </div>
        </div>
      )}
    </div>
  );
}
