import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api/client";
import { PdfLink } from "../components/PdfLink";
import { Panel } from "../components/dashboard/widgets";

/**
 * Seite hinter dem QR-Code (/q/<Art>/<ID>): Zusammenfassung des Artikels, bei Material die Spulen, bei einer Spule die Angaben
 * (Restmenge, Altbestand vor Geschäftsbeginn, Notiz) und der Druck der Etiketten.
 */

interface Spool { id: string; label: string | null; initialGrams: number; remainingGrams: number | null; preBusiness: boolean; acquiredAt: string | null; note: string | null; isEmpty: boolean }
interface Resolved {
  type: "material" | "spool" | "product" | "printer";
  id: string;
  title: string;
  lines: string[];
  material?: { id: string; name?: string; unit: string; stockQuantity?: number };
  spools?: Spool[];
  spool?: Spool;
}

const TYPE_LABEL = { material: "Material", spool: "Spule", product: "Produkt", printer: "Drucker" } as const;
const input = "px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm";
const day = (iso: string | null) => (iso ? iso.slice(0, 10) : "");

function LabelPrint({ type, ids }: { type: string; ids: string[] }) {
  const [format, setFormat] = useState("62x29");
  const [formats, setFormats] = useState<{ key: string; label: string }[]>([]);
  useEffect(() => { api.get("/qr/formats").then((r) => setFormats(r.data)).catch(() => undefined); }, []);
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <select value={format} onChange={(e) => setFormat(e.target.value)} className={input} aria-label="Etikettengröße">
        {formats.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
      </select>
      <PdfLink url={`/qr/labels.pdf?type=${type}&ids=${ids.join(",")}&format=${format}`} filename="qr-etiketten.pdf" className={`px-3 py-2 rounded-lg bg-brand text-white ${ids.length === 0 ? "opacity-50 pointer-events-none" : ""}`}>
        {ids.length > 1 ? `${ids.length} Etiketten drucken` : "Etikett drucken"}
      </PdfLink>
    </div>
  );
}

export default function ScanItem() {
  const { type, id } = useParams();
  const [d, setD] = useState<Resolved | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [form, setForm] = useState<Spool | null>(null);
  const [add, setAdd] = useState({ count: "1", grams: "1000", label: "", preBusiness: false, note: "" });

  const load = useCallback(() => {
    api.get(`/qr/resolve/${type}/${id}`).then((r) => { setD(r.data); setForm(r.data.spool ?? null); }).catch((e) => setError(e?.response?.data?.error ?? "Nicht gefunden."));
  }, [type, id]);
  useEffect(load, [load]);

  const fail = (e: any, fb: string) => setMsg(e?.response?.data?.error ?? fb);

  async function saveSpool() {
    if (!form) return;
    setMsg(null);
    try {
      await api.patch(`/spools/${form.id}`, { label: form.label, remainingGrams: form.remainingGrams, preBusiness: form.preBusiness, acquiredAt: form.acquiredAt ? new Date(form.acquiredAt).toISOString() : null, note: form.note, isEmpty: form.isEmpty });
      setMsg("Gespeichert.");
      load();
    } catch (e) { fail(e, "Speichern hat nicht geklappt."); }
  }
  async function addSpools() {
    if (!d?.material) return;
    setMsg(null);
    try {
      await api.post("/spools", { materialId: d.material.id, count: Number(add.count) || 1, initialGrams: Number(add.grams) || 1000, label: add.label || null, preBusiness: add.preBusiness, note: add.note || null });
      setAdd({ ...add, label: "", note: "" });
      load();
    } catch (e) { fail(e, "Anlegen hat nicht geklappt."); }
  }
  async function removeSpool(s: Spool) {
    if (!window.confirm(`Spule "${s.label ?? ""}" löschen?`)) return;
    try { await api.delete(`/spools/${s.id}`); setPicked((p) => p.filter((x) => x !== s.id)); load(); } catch (e) { fail(e, "Löschen hat nicht geklappt."); }
  }

  if (error) return <div className="max-w-xl"><p className="text-red-600 mb-2">{error}</p><p className="text-sm text-slate-500">Der Code gehört zu einem Artikel, den es nicht mehr gibt, oder zu einer anderen Firma.</p></div>;
  if (!d) return <p className="text-slate-500">Wird geladen ...</p>;
  const spools = d.spools ?? [];

  return (
    <div className="max-w-3xl">
      <div className="flex flex-wrap items-start gap-4 mb-5">
        <img src={`/api/qr/${d.type}/${d.id}.png`} alt="QR-Code" className="w-24 h-24 rounded-lg bg-white p-1.5 shrink-0" />
        <div className="min-w-0 flex-1">
          <span className="text-xs px-2 py-0.5 rounded-full bg-brand/15 text-brand">{TYPE_LABEL[d.type]}</span>
          <h1 className="text-2xl font-semibold tracking-tight mt-1 break-words">{d.title}</h1>
          {d.lines.map((l) => <p key={l} className="text-sm text-slate-500">{l}</p>)}
          {d.spool?.preBusiness && <p className="mt-1 text-sm font-medium text-amber-600 dark:text-amber-400">Altbestand: war schon vor Geschäftsbeginn vorhanden</p>}
        </div>
      </div>
      {msg && <p className="text-sm text-slate-600 dark:text-slate-300 mb-3">{msg}</p>}

      {d.type === "spool" && form && (
        <Panel title="Angaben zur Spule" className="mb-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <label className="block">Bezeichnung<input value={form.label ?? ""} onChange={(e) => setForm({ ...form, label: e.target.value })} className={`${input} w-full mt-1`} /></label>
            <label className="block">Restmenge (g, geschätzt oder gewogen)<input type="number" min={0} value={form.remainingGrams ?? ""} onChange={(e) => setForm({ ...form, remainingGrams: e.target.value === "" ? null : Number(e.target.value) })} className={`${input} w-full mt-1`} /></label>
            <label className="block">Erworben am (optional)<input type="date" value={day(form.acquiredAt)} onChange={(e) => setForm({ ...form, acquiredAt: e.target.value || null })} className={`${input} w-full mt-1`} /></label>
            <label className="block">Notiz<input value={form.note ?? ""} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="z.B. Farbe leicht anders, feucht gewesen" className={`${input} w-full mt-1`} /></label>
          </div>
          <label className="flex items-start gap-2 text-sm mt-3"><input type="checkbox" className="mt-0.5" checked={form.preBusiness} onChange={(e) => setForm({ ...form, preBusiness: e.target.checked })} /><span><strong>Altbestand:</strong> Diese Spule war schon vor dem Start des Geschäfts da (z.B. vor der Gewerbeanmeldung). Das dient der Kennzeichnung; den Materialbestand und die Ausgaben ändert es nicht.</span></label>
          <label className="flex items-center gap-2 text-sm mt-2"><input type="checkbox" checked={form.isEmpty} onChange={(e) => setForm({ ...form, isEmpty: e.target.checked })} />Aufgebraucht / leer</label>
          <button onClick={saveSpool} className="mt-3 px-4 py-2 rounded-lg bg-brand text-white text-sm">Speichern</button>
          {d.material && <p className="text-sm mt-3">Material: <Link to={`/q/material/${d.material.id}`} className="text-brand hover:underline">{d.material.name}</Link></p>}
        </Panel>
      )}

      {d.type === "material" && (
        <>
          <Panel title="Spulen" className="mb-3">
            {spools.length === 0 ? <p className="text-sm text-slate-500">Noch keine einzelnen Spulen erfasst. Lege sie unten an, dann bekommt jede Rolle ihren eigenen QR-Code.</p> : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-700 text-sm">{spools.map((s) => (
                <li key={s.id} className="py-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <input type="checkbox" checked={picked.includes(s.id)} onChange={(e) => setPicked((p) => (e.target.checked ? [...p, s.id] : p.filter((x) => x !== s.id)))} aria-label="Etikett wählen" />
                  <Link to={`/q/spool/${s.id}`} className="font-medium hover:text-brand">{s.label ?? "Spule"}</Link>
                  <span className="text-xs text-slate-500">{s.remainingGrams ?? s.initialGrams} / {s.initialGrams} g</span>
                  {s.preBusiness && <span className="text-xs px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400">Altbestand</span>}
                  {s.isEmpty && <span className="text-xs px-1.5 py-0.5 rounded bg-slate-500/15 text-slate-500">leer</span>}
                  <button onClick={() => removeSpool(s)} className="ml-auto text-xs text-red-600 hover:underline">Löschen</button>
                </li>))}</ul>
            )}
            {spools.length > 0 && (
              <div className="mt-3 space-y-2">
                <div className="flex gap-3 text-xs"><button onClick={() => setPicked(spools.map((s) => s.id))} className="text-brand hover:underline">Alle wählen</button><button onClick={() => setPicked([])} className="text-slate-500 hover:underline">Keine</button></div>
                <LabelPrint type="spool" ids={picked} />
              </div>
            )}
          </Panel>
          <Panel title="Spulen anlegen" className="mb-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <label className="block">Anzahl<input type="number" min={1} max={50} value={add.count} onChange={(e) => setAdd({ ...add, count: e.target.value })} className={`${input} w-full mt-1`} /></label>
              <label className="block">Gewicht je Spule (g)<input type="number" min={1} value={add.grams} onChange={(e) => setAdd({ ...add, grams: e.target.value })} className={`${input} w-full mt-1`} /></label>
              <label className="block col-span-2">Bezeichnung (optional)<input value={add.label} onChange={(e) => setAdd({ ...add, label: e.target.value })} placeholder="z.B. Lieferung Nov" className={`${input} w-full mt-1`} /></label>
            </div>
            <label className="flex items-start gap-2 text-sm mt-3"><input type="checkbox" className="mt-0.5" checked={add.preBusiness} onChange={(e) => setAdd({ ...add, preBusiness: e.target.checked })} /><span>Altbestand (war schon vor Geschäftsbeginn vorhanden)</span></label>
            <button onClick={addSpools} className="mt-3 px-4 py-2 rounded-lg bg-brand text-white text-sm">Anlegen</button>
          </Panel>
        </>
      )}

      <Panel title="Etikett für diesen Artikel" className="mb-3">
        <LabelPrint type={d.type} ids={[d.id]} />
        <p className="text-xs text-slate-500 mt-2">Gedruckt wird über den normalen Druckdialog (Etikettendrucker mit Treiber, Papiergröße passend wählen). Der Code enthält nur einen Link auf diese Software; scannen kann ihn jeder, sehen kann den Artikel nur, wer angemeldet ist.</p>
      </Panel>

      {d.type === "material" && <p className="text-sm"><Link to="/catalog?tab=materials" className="text-brand hover:underline">← Zum Materiallager</Link></p>}
      {d.type === "product" && <p className="text-sm"><Link to="/catalog?tab=products" className="text-brand hover:underline">Zu den Produkten</Link></p>}
      {d.type === "printer" && <p className="text-sm"><Link to="/catalog?tab=printers" className="text-brand hover:underline">Zu den Druckern</Link></p>}
    </div>
  );
}
