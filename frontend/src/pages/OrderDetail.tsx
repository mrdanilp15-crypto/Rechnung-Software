import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api/client";
import { OrderCostDialog } from "../components/OrderCostDialog";
import { PdfLink } from "../components/PdfLink";
import { Panel, eur } from "../components/dashboard/widgets";
import { PrintStartButton } from "../components/PrintStartButton";
import { useAuthStore } from "../store/authStore";

/** Auftragsseite: alles zu einem Auftrag an einem Ort - Positionen, Belege, Drucke, Zeiten, Dateien, Kommentare und Verlauf. */

interface Detail {
  printables: { documentId: string; fileName: string; label: string; source: "order" | "product"; revision: number | null }[];
  order: {
    id: string; number: string; documentStatus: string; productionStatus: string; priority: number; issueDate: string; expectedDeliveryDate: string | null;
    totalCents: number; subtotalCents: number; notes: string | null; productionNote: string | null; carrier: string | null; trackingNumber: string | null;
    shippedAt: string | null; shippedMailAt: string | null; voided: boolean;
    customer: { id: string; name: string; contactName: string | null; email: string | null; phone: string | null };
    items: { description: string; quantity: number; unit: string; unitPriceCents: number; lineTotalCents: number }[];
  };
  links: { quote: { id: string; quoteNumber: string; status: string } | null; deliveryNotes: { id: string; noteNumber: string; status: string }[]; invoices: { id: string; invoiceNumber: string | null; status: string; totalCents: number; isCancellationDocument: boolean }[] };
  jobs: { id: string; name: string | null; printerName: string; startedAt: string; endedAt: string | null; minutes: number | null; result: string | null }[];
  timeMinutes: number;
  files: { id: string; note: string | null; addedAt: string; documentId: string; title: string; fileName: string; sizeBytes: number }[];
  comments: { id: string; text: string; createdAt: string; userName: string | null; mine: boolean }[];
  timeline: { at: string; kind: string; text: string; by: string | null }[];
}
interface Candidate { id: string; title: string; fileName: string; sizeBytes: number }

const STATUS: Record<string, { label: string; cls: string }> = {
  CREATED: { label: "Erstellt", cls: "bg-slate-500/15 text-slate-600 dark:text-slate-300" },
  IN_PRODUCTION: { label: "In Produktion", cls: "bg-brand/15 text-brand" },
  READY_TO_SHIP: { label: "Versandbereit", cls: "bg-green-500/15 text-green-600 dark:text-green-400" },
  SHIPPED: { label: "Versendet", cls: "bg-slate-500/15 text-slate-500" },
};
const PRIORITIES = [{ v: 0, l: "Normal" }, { v: 1, l: "Hoch" }, { v: 2, l: "Dringend" }];
const KIND_DOT: Record<string, string> = { created: "bg-slate-400", comment: "bg-brand", status: "bg-amber-500", print: "bg-green-500", time: "bg-violet-500", file: "bg-sky-500" };
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("de-DE");
const fmtDateTime = (iso: string) => new Date(iso).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const hm = (m: number) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
const size = (b: number) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const input = "px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm";

export default function OrderDetail() {
  const { id } = useParams();
  const [d, setD] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [costOpen, setCostOpen] = useState(false);
  const [picking, setPicking] = useState(false);
  const [q, setQ] = useState("");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const isAdmin = useAuthStore((s) => s.user?.role) === "ADMIN";

  const load = useCallback(() => {
    api.get(`/orders/${id}`).then((r) => setD(r.data)).catch((e) => setError(e?.response?.data?.error ?? "Auftrag konnte nicht geladen werden."));
  }, [id]);
  useEffect(load, [load]);
  useEffect(() => {
    if (!picking) return;
    const t = setTimeout(() => api.get(`/orders/${id}/files/candidates`, { params: { q } }).then((r) => setCandidates(r.data)).catch(() => setCandidates([])), 250);
    return () => clearTimeout(t);
  }, [picking, q, id]);

  const fail = (e: any, fb: string) => setMsg(e?.response?.data?.error ?? fb);

  async function setPriority(v: number) {
    try { await api.patch(`/orders/${id}`, { priority: v }); load(); } catch (e) { fail(e, "Priorität konnte nicht geändert werden."); }
  }
  async function addComment() {
    if (!comment.trim()) return;
    try { await api.post(`/orders/${id}/comments`, { text: comment }); setComment(""); load(); } catch (e) { fail(e, "Kommentar konnte nicht gespeichert werden."); }
  }
  async function delComment(cid: string) {
    if (!window.confirm("Kommentar löschen?")) return;
    try { await api.delete(`/orders/${id}/comments/${cid}`); load(); } catch (e) { fail(e, "Löschen hat nicht geklappt."); }
  }
  async function attach(documentId: string) {
    try { await api.post(`/orders/${id}/files`, { documentId }); setPicking(false); load(); } catch (e) { fail(e, "Zuordnen hat nicht geklappt."); }
  }
  async function upload(file: File) {
    setMsg(null);
    try {
      const fd = new FormData();
      fd.append("files", file);
      fd.append("category", "KORRESPONDENZ");
      fd.append("title", `${d?.order.number ?? "Auftrag"} - ${file.name}`.slice(0, 200));
      fd.append("tags", "auftrag");
      const { data } = await api.post("/archive", fd, { headers: { "Content-Type": "multipart/form-data" } });
      if (data.created.length) await attach(data.created[0].id);
      else if (data.skipped.length) setMsg(`Diese Datei liegt schon im Archiv${data.skipped[0].existingTitle ? ` (als "${data.skipped[0].existingTitle}")` : ""} - über "Aus dem Archiv zuordnen" wählen.`);
      else setMsg(data.rejected[0]?.reason ?? "Datei wurde nicht angenommen.");
    } catch (e) { fail(e, "Hochladen hat nicht geklappt."); }
  }
  async function unlink(fid: string) {
    try { await api.delete(`/orders/${id}/files/${fid}`); load(); } catch (e) { fail(e, "Das hat nicht geklappt."); }
  }

  if (error) return <p className="text-red-600">{error}</p>;
  if (!d) return <p className="text-slate-500">Wird geladen ...</p>;
  const o = d.order;
  const st = STATUS[o.productionStatus] ?? STATUS.CREATED;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const overdue = !!o.expectedDeliveryDate && o.productionStatus !== "SHIPPED" && new Date(o.expectedDeliveryDate) < today;
  const printMinutes = d.jobs.reduce((a, j) => a + (j.minutes ?? 0), 0);

  return (
    <div className="max-w-6xl">
      <p className="text-sm mb-2"><Link to="/production" className="text-slate-500 hover:text-brand">← Aufträge</Link></p>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight flex flex-wrap items-center gap-3">
            {o.number}
            <span className={`text-sm font-medium px-2.5 py-1 rounded-full ${st.cls}`}>{st.label}</span>
            {o.voided && <span className="text-sm px-2.5 py-1 rounded-full bg-red-500/15 text-red-500">storniert</span>}
          </h1>
          <p className="text-sm text-slate-500 mt-1"><Link to={`/customers/${o.customer.id}`} className="hover:text-brand">{o.customer.name}</Link>{o.customer.contactName ? ` · ${o.customer.contactName}` : ""}{o.customer.email ? ` · ${o.customer.email}` : ""}{o.customer.phone ? ` · ${o.customer.phone}` : ""}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-sm text-slate-500 flex items-center gap-2">Priorität
            <select value={o.priority} onChange={(e) => setPriority(Number(e.target.value))} className={input}>{PRIORITIES.map((p) => <option key={p.v} value={p.v}>{p.l}</option>)}</select>
          </label>
          <button onClick={() => setCostOpen(true)} className="px-3 py-2 rounded-lg text-sm bg-brand text-white">Kosten</button>
          <Link to={o.documentStatus === "DRAFT" ? `/order-confirmations/${o.id}/edit` : "/documents?type=ORDER_CONFIRMATION"} className="px-3 py-2 rounded-lg text-sm border border-slate-300 dark:border-slate-600">Beleg</Link>
        </div>
      </div>
      {msg && <p className="text-sm text-red-600 mb-3">{msg}</p>}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4 text-sm">
        {[
          ["Auftragswert", eur(o.subtotalCents) + " netto"],
          ["Liefertermin", o.expectedDeliveryDate ? `${fmtDate(o.expectedDeliveryDate)}${overdue ? " (überfällig)" : ""}` : "nicht gesetzt"],
          ["Druckzeit", d.jobs.length > 0 ? `${hm(printMinutes)} h (${d.jobs.length} Druck${d.jobs.length === 1 ? "" : "e"})` : "noch kein Druck"],
          ["Arbeitszeit", d.timeMinutes > 0 ? `${hm(d.timeMinutes)} h` : "keine erfasst"],
        ].map(([l, v], i) => (
          <div key={l} className="bg-white dark:bg-slate-800 rounded-xl p-3 shadow"><p className="text-xs text-slate-500">{l}</p><p className={`font-medium ${i === 1 && overdue ? "text-red-500" : ""}`}>{v}</p></div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="lg:col-span-2 space-y-3 min-w-0">
          <Panel title="Positionen">
            <div className="overflow-x-auto"><table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-slate-500"><th className="pb-1">Beschreibung</th><th className="pb-1 text-right">Menge</th><th className="pb-1 text-right">Einzel</th><th className="pb-1 text-right">Summe</th></tr></thead>
              <tbody>{o.items.map((i, n) => <tr key={n} className="border-t border-slate-100 dark:border-slate-700"><td className="py-1.5 pr-2 whitespace-pre-line">{i.description}</td><td className="text-right whitespace-nowrap">{i.quantity} {i.unit}</td><td className="text-right whitespace-nowrap">{eur(i.unitPriceCents)}</td><td className="text-right whitespace-nowrap">{eur(i.lineTotalCents)}</td></tr>)}</tbody>
            </table></div>
            {o.notes && <p className="text-xs text-slate-500 mt-2">Anmerkung: {o.notes}</p>}
            {o.productionNote && <p className="text-xs rounded bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300 px-2 py-1 mt-2">Notiz im Board: {o.productionNote}</p>}
          </Panel>

          <Panel title="Kommentare">
            <div className="flex gap-2 mb-3">
              <input value={comment} onChange={(e) => setComment(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addComment()} placeholder="Kommentar schreiben (z.B. Kundenwunsch, Absprache)" className={`${input} flex-1 min-w-0`} />
              <button onClick={addComment} disabled={!comment.trim()} className="px-4 py-2 rounded-lg text-sm bg-brand text-white disabled:opacity-50">Senden</button>
            </div>
            {d.comments.length === 0 ? <p className="text-sm text-slate-500">Noch keine Kommentare.</p> : (
              <ul className="space-y-2">{d.comments.map((c) => (
                <li key={c.id} className="rounded-lg bg-slate-50 dark:bg-slate-900/40 px-3 py-2 text-sm">
                  <div className="flex justify-between gap-2 text-xs text-slate-500"><span>{c.userName} · {fmtDateTime(c.createdAt)}</span>{c.mine && <button onClick={() => delComment(c.id)} className="hover:text-red-500">Löschen</button>}</div>
                  <p className="whitespace-pre-line">{c.text}</p>
                </li>))}</ul>
            )}
          </Panel>

          <Panel title="Dateien">
            <div className="flex flex-wrap gap-2 mb-3 text-sm">
              <label className="px-3 py-1.5 rounded-lg bg-brand text-white cursor-pointer">Datei hochladen<input type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) upload(f); }} /></label>
              <button onClick={() => setPicking((v) => !v)} className="px-3 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-700">Aus dem Archiv zuordnen</button>
            </div>
            {picking && (
              <div className="rounded-lg bg-slate-50 dark:bg-slate-900/40 p-2 mb-3 space-y-2">
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Im Archiv suchen" className={`${input} w-full`} />
                <ul className="max-h-44 overflow-y-auto divide-y divide-slate-200 dark:divide-slate-700 text-xs">
                  {candidates.map((c) => <li key={c.id} className="py-1.5 flex justify-between gap-2"><span className="truncate">{c.title} <span className="text-slate-500">· {c.fileName}</span></span><button onClick={() => attach(c.id)} className="text-brand hover:underline shrink-0">Zuordnen</button></li>)}
                  {candidates.length === 0 && <li className="py-2 text-slate-500">Keine passenden Dokumente.</li>}
                </ul>
              </div>
            )}
            {d.files.length === 0 ? <p className="text-sm text-slate-500">Noch keine Dateien (Kundenvorlagen, Fotos, Freigaben). Sie liegen im Belegarchiv und lassen sich dort auch suchen.</p> : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-700 text-sm">{d.files.map((f) => (
                <li key={f.id} className="py-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="min-w-0 truncate">{f.fileName} <span className="text-xs text-slate-500">{size(f.sizeBytes)} · {fmtDate(f.addedAt)}</span></span>
                  <span className="flex gap-3 text-xs"><PdfLink url={`/archive/${f.documentId}/file?download=1`} filename={f.fileName} download className="text-brand hover:underline">Herunterladen</PdfLink><button onClick={() => unlink(f.id)} className="text-red-600 hover:underline">Lösen</button></span>
                </li>))}</ul>
            )}
          </Panel>
        </div>

        <div className="space-y-3 min-w-0">
          <Panel title="Belege">
            <ul className="text-sm space-y-1.5">
              {d.links.quote && <li><span className="text-slate-500">Angebot</span> · <Link to="/documents?type=QUOTE" className="text-brand hover:underline">{d.links.quote.quoteNumber}</Link></li>}
              {d.links.deliveryNotes.map((n) => <li key={n.id}><span className="text-slate-500">Lieferschein</span> · <Link to="/documents?type=DELIVERY_NOTE" className="text-brand hover:underline">{n.noteNumber}</Link></li>)}
              {d.links.invoices.map((i) => <li key={i.id}><span className="text-slate-500">{i.isCancellationDocument ? "Korrekturbeleg" : "Rechnung"}</span> · <Link to={`/invoices/${i.id}`} className="text-brand hover:underline">{i.invoiceNumber ?? "Entwurf"}</Link> · {eur(i.totalCents)}</li>)}
              {!d.links.quote && d.links.deliveryNotes.length === 0 && d.links.invoices.length === 0 && <li className="text-slate-500">Noch keine verknüpften Belege.</li>}
            </ul>
          </Panel>
          <Panel title="Drucke">
            {isAdmin && d.printables.length > 0 && (
              <div className="mb-3 rounded-lg border border-brand/30 bg-brand/5 p-3">
                <p className="text-xs font-medium text-slate-500 mb-2">Jetzt drucken</p>
                <ul className="space-y-2 text-sm">
                  {d.printables.map((p) => (
                    <li key={p.documentId} className="flex items-center gap-2">
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium truncate">{p.label}</span>
                        <span className="block text-xs text-slate-500 truncate">{p.source === "product" ? `Produktdatei, Version ${p.revision}` : "Datei am Auftrag"} · {p.fileName}</span>
                      </span>
                      <PrintStartButton documentId={p.documentId} orderId={d.order.id} label="Drucken" className="shrink-0 bg-brand hover:bg-brand-dark text-white px-3 py-1.5 rounded-lg text-sm" />
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {d.jobs.length === 0 ? <p className="text-sm text-slate-500">Noch kein Druck zugeordnet. Beim Senden eines Drucks oder im Druckverlauf des Druckers den Auftrag wählen.</p> : (
              <ul className="text-sm space-y-1.5">{d.jobs.map((j) => <li key={j.id}><span className="font-medium">{j.name ?? "Druckauftrag"}</span> <span className="text-xs text-slate-500">· {j.printerName} · {j.endedAt ? `${hm(j.minutes ?? 0)} h · ${j.result === "FINISHED" ? "fertig" : j.result === "FAILED" ? "fehlgeschlagen" : j.result === "CANCELLED" ? "abgebrochen" : "beendet"}` : "läuft"}</span></li>)}</ul>
            )}
          </Panel>
          <Panel title="Versand">
            {o.shippedAt ? <p className="text-sm">Versendet am {fmtDate(o.shippedAt)}{o.carrier ? ` mit ${o.carrier}` : ""}{o.trackingNumber ? `, Sendung ${o.trackingNumber}` : ""}.{o.shippedMailAt ? ` Versandmail am ${fmtDate(o.shippedMailAt)}.` : ""}</p> : <p className="text-sm text-slate-500">Noch nicht versendet. Im Auftragsboard nach "Versendet" verschieben (mit Sendungsnummer und Versandmail).</p>}
          </Panel>
          <Panel title="Verlauf">
            <ol className="space-y-2.5">{d.timeline.slice(0, 30).map((e, i) => (
              <li key={i} className="flex gap-2.5 text-sm"><span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${KIND_DOT[e.kind] ?? "bg-slate-400"}`} /><div className="min-w-0"><p className="break-words">{e.text}</p><p className="text-xs text-slate-500">{fmtDateTime(e.at)}{e.by ? ` · ${e.by}` : ""}</p></div></li>))}</ol>
          </Panel>
        </div>
      </div>
      {costOpen && <OrderCostDialog orderId={o.id} onClose={() => setCostOpen(false)} />}
    </div>
  );
}
