import { useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import { disposeOcr, loadImage, prepareCanvas, recognizeReceipt, rotatedJpeg, type OcrMode, type OcrResult } from "../lib/ocr";
import { PdfCanvasViewer } from "./PdfCanvasViewer";

/**
 * Beleg scannen: Foto oder PDF wählen -> Text wird lokal im Browser erkannt (kein Cloud-Dienst) -> Vorschläge für Datum, Händler,
 * Betrag, Steuersatz und Kategorie. Alles lässt sich nachbessern: Felder ändern, Alternativen antippen, Zeilen aus dem erkannten
 * Text übernehmen, den Text selbst korrigieren und neu auswerten, das Foto drehen oder mit mehr Kontrast neu lesen.
 * Gespeichert wird erst nach Bestätigung.
 */

type Confidence = "high" | "medium" | "low";
interface Suggestion {
  amountCents: number | null;
  amountConfidence: Confidence;
  amountCandidates: { cents: number; line: string }[];
  date: string | null;
  dateConfidence: Confidence;
  dateCandidates: { date: string; line: string }[];
  vendor: string | null;
  vendorConfidence: Confidence;
  vendorCandidates: { name: string; source: string }[];
  vatRateBps: number | null;
  vatConfidence: Confidence;
  netCents: number | null;
  vatCents: number | null;
  invoiceNumber: string | null;
  category: string | null;
  categorySource: "keywords" | "history" | null;
  warnings: string[];
  lines: { text: string; amounts: number[]; dates: string[] }[];
  duplicate: { vendor: string; date: string; amountCents: number } | null;
}

const CATEGORIES = ["Material", "Software", "Fahrtkosten", "Miete", "Werbung", "Sonstiges"];
const euro = (cents: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(cents / 100);
const inputCls = "w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800";
const chipCls = "px-2 py-1 rounded-full text-xs bg-slate-100 dark:bg-slate-700 hover:bg-brand hover:text-white transition-colors";

function Badge({ confidence, set }: { confidence: Confidence | null; set: boolean }) {
  if (!set) return <span className="text-xs px-1.5 py-0.5 rounded bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">nicht erkannt</span>;
  if (confidence === "high") return <span className="text-xs px-1.5 py-0.5 rounded bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300">sicher</span>;
  if (confidence === "medium") return <span className="text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">bitte prüfen</span>;
  if (confidence === "low") return <span className="text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">unsicher</span>;
  return null;
}

export function ReceiptScanDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [rotation, setRotation] = useState(0);
  const [mode, setMode] = useState<OcrMode>("normal");
  const [busy, setBusy] = useState<{ stage: string; fraction: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocr, setOcr] = useState<OcrResult | null>(null);
  const [text, setText] = useState("");
  const [sug, setSug] = useState<Suggestion | null>(null);
  const [form, setForm] = useState({ date: "", vendor: "", category: "Sonstiges", amountEur: "", vatRateBps: "1900", description: "" });
  const touched = useRef(new Set<string>());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const runId = useRef(0);
  const pickRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !saving && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose, saving]);
  useEffect(() => disposeOcr, []);

  const isPdf = !!file && (file.type === "application/pdf" || /\.pdf$/i.test(file.name));

  // Vorschau: PDFs direkt, Fotos gedreht
  useEffect(() => {
    if (!file) return;
    let url: string | null = null;
    let cancelled = false;
    (async () => {
      if (isPdf) {
        url = URL.createObjectURL(file);
      } else {
        try {
          const bitmap = await loadImage(file);
          const canvas = await prepareCanvas(bitmap as unknown as HTMLCanvasElement, rotation, "normal", false);
          const blob: Blob | null = await new Promise((r) => canvas.toBlob(r, "image/jpeg", 0.8));
          if (blob) url = URL.createObjectURL(blob);
        } catch {
          url = URL.createObjectURL(file);
        }
      }
      if (!cancelled) setPreviewUrl(url);
    })();
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [file, rotation, isPdf]);

  function applySuggestion(s: Suggestion) {
    setSug(s);
    setForm((f) => {
      const next = { ...f };
      // Noch nicht von Hand geänderte Felder folgen immer dem neuesten Ergebnis (auch wenn dort nichts mehr erkannt wurde)
      const set = <K extends keyof typeof f>(key: K, value: (typeof f)[K] | null | undefined, fallback: (typeof f)[K]) => {
        if (!touched.current.has(key)) next[key] = value !== null && value !== undefined && value !== "" ? value : fallback;
      };
      set("date", s.date, new Date().toISOString().slice(0, 10));
      set("vendor", s.vendor, "");
      set("category", s.category, "Sonstiges");
      set("amountEur", s.amountCents !== null ? (s.amountCents / 100).toFixed(2) : null, "");
      set("vatRateBps", s.vatRateBps !== null ? String(s.vatRateBps) : null, "1900");
      set("description", s.invoiceNumber ? `Beleg ${s.invoiceNumber}` : null, "");
      return next;
    });
  }

  async function analyze(t: string) {
    const { data } = await api.post<Suggestion>("/expenses/parse-receipt", { text: t });
    applySuggestion(data);
  }

  async function run(f: File, rot: number, m: OcrMode) {
    const id = ++runId.current;
    setError(null);
    setBusy({ stage: "Beleg wird vorbereitet", fraction: 0 });
    try {
      const result = await recognizeReceipt(f, { rotation: rot, mode: m, onProgress: (stage, fraction) => runId.current === id && setBusy({ stage, fraction }) });
      if (runId.current !== id) return;
      setOcr(result);
      setText(result.text);
      await analyze(result.text);
    } catch (err) {
      if (runId.current !== id) return;
      console.error(err);
      setError("Die Texterkennung hat nicht funktioniert. Du kannst die Felder trotzdem von Hand ausfüllen.");
      setSug(null);
    } finally {
      if (runId.current === id) setBusy(null);
    }
  }

  function pick(f: File | null | undefined) {
    if (!f) return;
    touched.current = new Set();
    setFile(f);
    setRotation(0);
    setMode("normal");
    setOcr(null);
    setSug(null);
    setText("");
    setSaveError(null);
    setForm({ date: new Date().toISOString().slice(0, 10), vendor: "", category: "Sonstiges", amountEur: "", vatRateBps: "1900", description: "" });
    void run(f, 0, "normal");
  }

  function rotate(delta: number) {
    if (!file || isPdf) return;
    const next = (rotation + delta + 360) % 360;
    setRotation(next);
    void run(file, next, mode);
  }
  function rereadContrast() {
    if (!file) return;
    const next: OcrMode = mode === "normal" ? "kontrast" : "normal";
    setMode(next);
    void run(file, rotation, next);
  }

  function edit<K extends keyof typeof form>(key: K, value: string) {
    touched.current.add(key);
    setForm((f) => ({ ...f, [key]: value }));
  }

  const amountCents = Math.round(parseFloat(form.amountEur.replace(",", ".")) * 100);
  const vat = Number(form.vatRateBps);
  const netCents = Number.isFinite(amountCents) && amountCents > 0 ? Math.round(amountCents / (1 + vat / 10000)) : null;
  const canSave = !!file && !busy && form.vendor.trim().length > 0 && !!form.date && Number.isFinite(amountCents) && amountCents > 0;

  async function save(another: boolean) {
    if (!file || !canSave) return;
    setSaving(true);
    setSaveError(null);
    try {
      const body = new FormData();
      body.append("date", form.date);
      body.append("vendor", form.vendor.trim());
      body.append("category", form.category);
      body.append("amountCents", String(amountCents));
      body.append("vatRateBps", form.vatRateBps);
      if (form.description.trim()) body.append("description", form.description.trim());
      // Gedrehte Fotos so ablegen, wie man sie sieht; alles andere unverändert
      const upload = !isPdf && rotation !== 0 ? await rotatedJpeg(file, rotation) : file;
      body.append("receipt", upload);
      await api.post("/expenses", body, { headers: { "Content-Type": "multipart/form-data" } });
      onSaved();
      if (another) {
        setFile(null);
        setSug(null);
        setOcr(null);
        setText("");
        touched.current = new Set();
      } else {
        onClose();
      }
    } catch (err: any) {
      setSaveError(err?.response?.data?.error ?? "Speichern hat nicht geklappt.");
    } finally {
      setSaving(false);
    }
  }

  const field = (label: string, badge: React.ReactNode, children: React.ReactNode, chips?: React.ReactNode) => (
    <div>
      <div className="flex items-center justify-between gap-2 mb-1">
        <label className="block text-sm">{label}</label>
        {badge}
      </div>
      {children}
      {chips && <div className="flex flex-wrap gap-1.5 mt-1.5">{chips}</div>}
    </div>
  );

  return (
    <div className="fixed inset-0 z-[55] bg-black/50 flex items-stretch sm:items-center justify-center sm:p-4" role="dialog" aria-label="Beleg scannen">
      <div className="bg-white dark:bg-slate-900 w-full max-w-5xl sm:rounded-xl shadow-xl flex flex-col max-h-full sm:max-h-[94vh]">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200 dark:border-slate-700 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <h2 className="font-semibold flex-1">Beleg scannen</h2>
          <span className="hidden sm:inline text-xs text-slate-500">Die Erkennung läuft lokal auf diesem Gerät - der Beleg wird an niemanden geschickt.</span>
          <button onClick={onClose} disabled={saving} className="px-3 py-1.5 rounded-lg text-sm bg-slate-100 dark:bg-slate-800" aria-label="Schließen">✕</button>
        </div>

        <div className="overflow-y-auto p-4 flex-1">
          {!file && (
            <div className="text-center py-10 px-4">
              <p className="mb-1 font-medium">Foto oder PDF vom Beleg wählen</p>
              <p className="text-sm text-slate-500 mb-5">Kassenbon, Rechnung, Quittung. Datum, Händler, Betrag und Steuersatz werden vorgeschlagen - du prüfst und bessert nach.</p>
              <div className="flex flex-wrap gap-3 justify-center">
                <button onClick={() => cameraRef.current?.click()} className="bg-brand hover:bg-brand-dark text-white px-5 py-2.5 rounded-lg">Foto aufnehmen</button>
                <button onClick={() => pickRef.current?.click()} className="bg-slate-200 dark:bg-slate-700 px-5 py-2.5 rounded-lg">Datei wählen</button>
              </div>
              <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
              <input ref={pickRef} type="file" accept="image/*,application/pdf,.pdf" className="hidden" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
              <p className="text-xs text-slate-500 mt-6">Tipp: Beleg flach hinlegen, gutes Licht, gerade von oben fotografieren. Beim ersten Mal lädt die Erkennung einmalig (ca. 5 MB) und läuft danach auch ohne Netz.</p>
            </div>
          )}

          {file && (
            <div className="grid lg:grid-cols-2 gap-5">
              {/* Vorschau */}
              <div>
                <div className="flex flex-wrap gap-2 mb-2">
                  {!isPdf && (
                    <>
                      <button type="button" onClick={() => rotate(-90)} disabled={!!busy} className="px-3 py-1.5 rounded-lg text-sm bg-slate-100 dark:bg-slate-800 disabled:opacity-50">↺ Drehen</button>
                      <button type="button" onClick={() => rotate(90)} disabled={!!busy} className="px-3 py-1.5 rounded-lg text-sm bg-slate-100 dark:bg-slate-800 disabled:opacity-50">↻ Drehen</button>
                    </>
                  )}
                  <button type="button" onClick={rereadContrast} disabled={!!busy || (isPdf && ocr?.method === "pdf-text")} className="px-3 py-1.5 rounded-lg text-sm bg-slate-100 dark:bg-slate-800 disabled:opacity-50" title="Liest den Beleg mit anderer Bildaufbereitung noch einmal">
                    {mode === "normal" ? "Mit mehr Kontrast neu lesen" : "Normal neu lesen"}
                  </button>
                  <button type="button" onClick={() => { setFile(null); setSug(null); runId.current++; setBusy(null); }} disabled={saving} className="px-3 py-1.5 rounded-lg text-sm bg-slate-100 dark:bg-slate-800 ml-auto">Anderer Beleg</button>
                </div>
                <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-950 max-h-[60vh] overflow-auto p-2">
                  {previewUrl && (isPdf ? <PdfCanvasViewer url={previewUrl} /> : <img src={previewUrl} alt="Beleg" className="mx-auto max-w-full h-auto" />)}
                </div>
                {ocr && !busy && (
                  <p className={`text-xs mt-2 ${ocr.confidence < 60 ? "text-amber-700 dark:text-amber-400" : "text-slate-500"}`}>
                    {ocr.method === "pdf-text" ? "Text direkt aus dem PDF gelesen." : `Erkennungsqualität ${Math.round(ocr.confidence)} %.`}
                    {ocr.method === "ocr" && ocr.confidence < 60 && " Niedrig - Beleg gedreht? Mit Drehen oder mehr Kontrast erneut versuchen, sonst unten die Zeilen selbst übernehmen."}
                  </p>
                )}
              </div>

              {/* Formular */}
              <div className="space-y-4">
                {busy && (
                  <div className="rounded-lg bg-brand/10 p-3" aria-live="polite">
                    <p className="text-sm font-medium">{busy.stage} ...</p>
                    <div className="h-2 mt-2 rounded bg-slate-200 dark:bg-slate-700 overflow-hidden"><div className="h-full bg-brand transition-all" style={{ width: `${Math.round(busy.fraction * 100)}%` }} /></div>
                  </div>
                )}
                {error && <p className="text-sm text-red-600">{error}</p>}
                {sug?.duplicate && (
                  <p className="text-sm rounded-lg bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200 p-3">
                    Achtung: Es gibt schon eine Ausgabe von <strong>{sug.duplicate.vendor}</strong> über {euro(sug.duplicate.amountCents)} am {new Date(sug.duplicate.date).toLocaleDateString("de-DE")}. Eventuell ist der Beleg schon erfasst.
                  </p>
                )}
                {sug?.warnings.map((w) => <p key={w} className="text-sm rounded-lg bg-amber-50 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200 p-3">{w}</p>)}

                {field("Datum", sug && <Badge confidence={sug.dateConfidence} set={!!sug.date} />, <input type="date" value={form.date} onChange={(e) => edit("date", e.target.value)} className={inputCls} />,
                  sug?.dateCandidates.filter((d) => d.date !== form.date).map((d) => <button key={d.date} type="button" className={chipCls} onClick={() => edit("date", d.date)}>{new Date(d.date).toLocaleDateString("de-DE")}</button>))}

                {field("Händler / Lieferant", sug && <Badge confidence={sug.vendorConfidence} set={!!sug.vendor} />, <input value={form.vendor} onChange={(e) => edit("vendor", e.target.value)} className={inputCls} />,
                  sug?.vendorCandidates.filter((v) => v.name !== form.vendor).map((v) => <button key={v.name} type="button" className={chipCls} onClick={() => edit("vendor", v.name)}>{v.name}</button>))}

                {field("Betrag (€, brutto)", sug && <Badge confidence={sug.amountConfidence} set={sug.amountCents !== null} />, <input type="number" step="0.01" inputMode="decimal" value={form.amountEur} onFocus={(e) => e.target.select()} onChange={(e) => edit("amountEur", e.target.value)} className={inputCls} />,
                  sug?.amountCandidates.filter((a) => (a.cents / 100).toFixed(2) !== form.amountEur).map((a) => <button key={a.cents} type="button" className={chipCls} title={a.line} onClick={() => edit("amountEur", (a.cents / 100).toFixed(2))}>{euro(a.cents)}</button>))}

                <div className="grid grid-cols-2 gap-3">
                  {field("MwSt-Satz", sug && <Badge confidence={sug.vatConfidence} set={sug.vatRateBps !== null} />,
                    <select value={form.vatRateBps} onChange={(e) => edit("vatRateBps", e.target.value)} className={inputCls}>
                      <option value="1900">19 %</option>
                      <option value="700">7 %</option>
                      <option value="0">0 % (steuerfrei)</option>
                    </select>)}
                  {field("Kategorie", sug?.categorySource ? <span className="text-xs text-slate-500">{sug.categorySource === "history" ? "wie bisher" : "Vorschlag"}</span> : null,
                    <select value={form.category} onChange={(e) => edit("category", e.target.value)} className={inputCls}>
                      {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>)}
                </div>
                {netCents !== null && <p className="text-xs text-slate-500 -mt-2">Davon netto {euro(netCents)} und MwSt {euro(amountCents - netCents)}.</p>}

                {field("Beschreibung (optional)", null, <input value={form.description} onChange={(e) => edit("description", e.target.value)} className={inputCls} />)}

                {/* Nachbessern: erkannter Text */}
                <details className="rounded-lg border border-slate-200 dark:border-slate-700">
                  <summary className="cursor-pointer px-3 py-2 text-sm font-medium">Erkannten Text prüfen und Zeilen übernehmen</summary>
                  <div className="p-3 space-y-3">
                    {sug && sug.lines.length > 0 && (
                      <div className="max-h-56 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                        {sug.lines.map((l, i) => (
                          <div key={i} className="py-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="flex-1 min-w-[8rem] break-words">{l.text}</span>
                            {l.amounts.map((c, j) => <button key={`a${j}`} type="button" className={chipCls} onClick={() => edit("amountEur", (c / 100).toFixed(2))}>{euro(c)} als Betrag</button>)}
                            {l.dates.map((d, j) => <button key={`d${j}`} type="button" className={chipCls} onClick={() => edit("date", d)}>{new Date(d).toLocaleDateString("de-DE")} als Datum</button>)}
                            <button type="button" className={chipCls} onClick={() => edit("vendor", l.text.replace(/\s+/g, " ").slice(0, 60))}>als Händler</button>
                          </div>
                        ))}
                      </div>
                    )}
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">Falsch erkannte Stellen im Text selbst korrigieren, dann neu auswerten:</label>
                      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={6} className={`${inputCls} font-mono text-xs`} />
                      <button type="button" disabled={!!busy || !text.trim()} onClick={() => { setBusy({ stage: "Text wird ausgewertet", fraction: 0.5 }); analyze(text).finally(() => setBusy(null)); }} className="mt-2 px-3 py-1.5 rounded-lg text-sm bg-slate-100 dark:bg-slate-800 disabled:opacity-50">Neu auswerten</button>
                      <p className="text-xs text-slate-500 mt-1">Von Hand geänderte Felder oben bleiben dabei unverändert.</p>
                    </div>
                  </div>
                </details>
              </div>
            </div>
          )}
        </div>

        {file && (
          <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-700 flex flex-wrap items-center gap-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {saveError && <p className="text-sm text-red-600 w-full">{saveError}</p>}
            <button type="button" onClick={() => save(false)} disabled={!canSave || saving} className="bg-brand hover:bg-brand-dark text-white px-4 py-2 rounded-lg text-sm disabled:opacity-50">{saving ? "Wird gespeichert ..." : "Ausgabe speichern"}</button>
            <button type="button" onClick={() => save(true)} disabled={!canSave || saving} className="bg-slate-200 dark:bg-slate-700 px-4 py-2 rounded-lg text-sm disabled:opacity-50">Speichern und nächsten Beleg</button>
            <button type="button" onClick={onClose} disabled={saving} className="px-4 py-2 rounded-lg text-sm bg-slate-100 dark:bg-slate-800 ml-auto">Abbrechen</button>
          </div>
        )}
      </div>
    </div>
  );
}
