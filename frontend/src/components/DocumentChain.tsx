import { Fragment, useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { StatusChip } from "./StatusChip";
import { PdfLink } from "./PdfLink";
import { useToast } from "./Toast";
import { LinkDocsDialog, type LinkCandidate } from "./LinkDocsDialog";
import { createFinalInvoice, QUICK_INVOICE_CONFIRM } from "../lib/quickInvoice";

import { HelpTip } from "./HelpTip";
/**
 * Vorgangs-Übersicht: die ganze Belegkette zu einem Angebot, Auftrag, Lieferschein oder einer Rechnung (Angebot -> Auftrag -> Lieferschein -> Rechnung).
 * Jeder vorhandene Beleg ist antippbar; fehlende Schritte bieten direkt das Anlegen an (z.B. "Rechnung schreiben" beim Auftrag mit Lieferschein).
 */

type Kind = "QUOTE" | "ORDER_CONFIRMATION" | "DELIVERY_NOTE" | "INVOICE";

interface Node {
  kind: Kind;
  id: string;
  number: string | null;
  status: string;
  date: string;
  totalCents: number | null;
  emailSentAt: string | null;
  customerId?: string;
  isCancellationDocument?: boolean;
  invoiceKind?: string;
}
type ActionId = "order-from-quote" | "invoice-from-quote" | "down-payment-from-quote" | "delivery-note-from-order" | "invoice-from-order" | "down-payment-from-order";
interface Next { id: ActionId; label: string; hint: string; from: { kind: "QUOTE" | "ORDER_CONFIRMATION"; id: string } }
interface ChainData { quote: Node | null; orders: Node[]; deliveryNotes: Node[]; invoices: Node[]; next: Next[] }

const STEPS: { key: "quote" | "orders" | "deliveryNotes" | "invoices"; title: string; kind: Kind }[] = [
  { key: "quote", title: "Angebot", kind: "QUOTE" },
  { key: "orders", title: "Auftrag", kind: "ORDER_CONFIRMATION" },
  { key: "deliveryNotes", title: "Lieferschein", kind: "DELIVERY_NOTE" },
  { key: "invoices", title: "Rechnung", kind: "INVOICE" },
];
const STEP_OF: Record<ActionId, "quote" | "orders" | "deliveryNotes" | "invoices"> = {
  "order-from-quote": "orders", "invoice-from-quote": "invoices", "down-payment-from-quote": "invoices",
  "delivery-note-from-order": "deliveryNotes", "invoice-from-order": "invoices", "down-payment-from-order": "invoices",
};
const BASE: Record<Kind, string> = { QUOTE: "/quotes", ORDER_CONFIRMATION: "/order-confirmations", DELIVERY_NOTE: "/delivery-notes", INVOICE: "/invoices" };

/** Wohin führt ein Beleg: Entwurf -> Bearbeiten, sonst die Detailseite. */
function pathOf(n: Node): string | null {
  if (n.status === "DRAFT") return `${BASE[n.kind]}/${n.id}/edit`;
  if (n.kind === "QUOTE") return `/quotes/${n.id}`;
  if (n.kind === "ORDER_CONFIRMATION") return `/orders/${n.id}`;
  if (n.kind === "INVOICE") return `/invoices/${n.id}`;
  return `/delivery-notes/${n.id}`;
}
const money = (c: number | null) => (c === null ? "" : new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(c / 100));
const day = (iso: string) => new Intl.DateTimeFormat("de-DE").format(new Date(iso));

export function DocumentChain({ kind, id, onChanged }: { kind: Kind; id: string; onChanged?: () => void }) {
  const navigate = useNavigate();
  const showToast = useToast();
  const [chain, setChain] = useState<ChainData | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState<ActionId | null>(null);
  const [linkDlg, setLinkDlg] = useState<{ order: Node; candidates: LinkCandidate[] } | null>(null);
  const [linkBusy, setLinkBusy] = useState(false);

  const load = useCallback(() => {
    api.get(`/documents/chain/${kind}/${id}`).then((r) => { setChain(r.data); setFailed(false); }).catch(() => setFailed(true));
  }, [kind, id]);
  useEffect(load, [load]);

  /** Auftrag ohne Angebot: offene Angebote desselben Kunden zur Auswahl anbieten. */
  async function openLink(order: Node) {
    try {
      const { data } = await api.get("/documents");
      const cands = (data as { kind: Kind; id: string; number: string | null; date: string; totalCents: number | null; status: string; customerId: string; hasOrder: boolean }[])
        .filter((d) => d.kind === "QUOTE" && d.customerId === order.customerId && !d.hasOrder && ["SENT", "ACCEPTED", "EXPIRED"].includes(d.status))
        .map((d) => ({ id: d.id, number: d.number, date: d.date, totalCents: d.totalCents, status: d.status }));
      setLinkDlg({ order, candidates: cands });
    } catch {
      showToast("Angebote konnten nicht geladen werden", "error");
    }
  }
  async function link(orderId: string, quoteId: string) {
    setLinkBusy(true);
    try {
      const { data } = await api.post(`/order-confirmations/${orderId}/link-quote`, { quoteId });
      showToast(`Verknüpft mit Angebot ${data.quoteNumber}`, "success");
      setLinkDlg(null);
      load();
      onChanged?.();
    } catch (e: any) {
      showToast(e?.response?.data?.error ?? "Verknüpfen hat nicht geklappt", "error");
    } finally {
      setLinkBusy(false);
    }
  }
  async function unlink(orderId: string) {
    if (!window.confirm("Verknüpfung dieses Auftrags mit dem Angebot lösen? Das Angebot gilt danach wieder als nicht weitergeführt.")) return;
    try {
      await api.post(`/order-confirmations/${orderId}/unlink-quote`);
      showToast("Verknüpfung gelöst", "success");
      load();
      onChanged?.();
    } catch (e: any) {
      showToast(e?.response?.data?.error ?? "Lösen hat nicht geklappt", "error");
    }
  }

  /** Rechnung aus Auftrag/Angebot in einem Schritt anlegen und fertigstellen, dann gleich zum Senden */
  async function runFinal(a: Next) {
    if (!window.confirm(QUICK_INVOICE_CONFIRM)) return;
    setBusy(a.id);
    try {
      const r = await createFinalInvoice(a.from.kind === "QUOTE" ? "/quotes" : "/order-confirmations", a.from.id);
      showToast(r.message, r.ok ? "success" : "error");
      onChanged?.();
      navigate(r.path);
    } catch (e: any) {
      showToast(e?.response?.data?.error ?? "Das hat nicht geklappt", "error");
    } finally {
      setBusy(null);
    }
  }

  async function run(a: Next) {
    setBusy(a.id);
    try {
      let res;
      if (a.id === "order-from-quote") res = { data: (await api.post(`/quotes/${a.from.id}/convert-to-order-confirmation`)).data, to: "/order-confirmations" };
      else if (a.id === "invoice-from-quote") res = { data: (await api.post(`/quotes/${a.from.id}/convert-to-invoice`)).data, to: "/invoices" };
      else if (a.id === "delivery-note-from-order") res = { data: (await api.post(`/order-confirmations/${a.from.id}/convert-to-delivery-note`)).data, to: "/delivery-notes" };
      else if (a.id === "invoice-from-order") res = { data: (await api.post(`/order-confirmations/${a.from.id}/convert-to-invoice`)).data, to: "/invoices" };
      else {
        const p = window.prompt("Wie viel Prozent des Betrags soll als Anzahlung berechnet werden?", "30");
        if (p === null) return;
        const percent = parseFloat(p.replace(",", "."));
        if (!(percent > 0 && percent <= 100)) { showToast("Bitte einen Prozentsatz zwischen 1 und 100 eingeben", "error"); return; }
        const base = a.from.kind === "QUOTE" ? "/quotes" : "/order-confirmations";
        res = { data: (await api.post(`${base}/${a.from.id}/down-payment`, { percent })).data, to: "/invoices" };
      }
      showToast("Als Entwurf angelegt - bitte prüfen und fertigstellen", "success");
      onChanged?.();
      navigate(`${res.to}/${res.data.id}/edit`);
    } catch (e: any) {
      showToast(e?.response?.data?.error ?? "Das hat nicht geklappt", "error");
    } finally {
      setBusy(null);
    }
  }

  if (failed) return <p className="text-sm text-slate-500">Die Belegkette konnte nicht geladen werden.</p>;
  if (!chain) return <p className="text-sm text-slate-500">Wird geladen ...</p>;

  return (
    <>
    <ol className="relative space-y-3">
      {STEPS.map((step, idx) => {
        const nodes = step.key === "quote" ? (chain.quote ? [chain.quote] : []) : chain[step.key];
        const actions = chain.next.filter((a) => STEP_OF[a.id] === step.key);
        const last = idx === STEPS.length - 1;
        return (
          <li key={step.key} className="flex gap-3">
            <div className="flex flex-col items-center shrink-0">
              <span className={`w-3 h-3 rounded-full mt-1.5 ${nodes.length > 0 ? "bg-green-500" : "border-2 border-slate-300 dark:border-slate-600"}`} aria-hidden />
              {!last && <span className="w-px flex-1 bg-slate-200 dark:bg-slate-700 mt-1" aria-hidden />}
            </div>
            <div className="min-w-0 flex-1 pb-1">
              <p className="text-xs font-medium text-slate-500">{step.title}</p>
              {nodes.map((n) => {
                const path = pathOf(n);
                const current = n.kind === kind && n.id === id;
                const label = n.isCancellationDocument ? "Korrekturbeleg" : n.kind === "INVOICE" && n.invoiceKind === "DOWN_PAYMENT" ? "Anzahlung" : null;
                return (
                  <div key={n.id} className={`mt-1 rounded-lg border px-3 py-2 text-sm ${current ? "border-brand/50 bg-brand/5" : "border-slate-200 dark:border-slate-700"}`}>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      {path ? <Link to={path} className="font-medium text-brand hover:underline">{n.number ?? "Entwurf"}</Link> : <span className="font-medium">{n.number ?? "Entwurf"}</span>}
                      {label && <span className="text-xs text-slate-500">{label}</span>}
                      <StatusChip status={n.status} kind={n.kind} isCancellationDocument={n.isCancellationDocument} emailed={!!n.emailSentAt} />
                      {current && <span className="text-xs text-slate-500">(diese Seite)</span>}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-slate-500">
                      <span>{day(n.date)}</span>
                      {n.totalCents !== null && <span>{money(n.totalCents)}</span>}
                      {n.emailSentAt && <span>✉ gesendet {day(n.emailSentAt)}</span>}
                      {n.status !== "DRAFT" && <PdfLink url={`${BASE[n.kind]}/${n.id}/pdf`} filename={`${n.number ?? "beleg"}.pdf`} className="text-brand hover:underline">PDF</PdfLink>}
                      {n.status === "DRAFT" && path && <Link to={path} className="text-brand hover:underline">Weiter bearbeiten</Link>}
                    </div>
                  </div>
                );
              })}
              {nodes.length === 0 && actions.length === 0 && (step.key === "quote" && chain.orders.length > 0 && chain.orders[0].customerId
                ? <button type="button" onClick={() => openLink(chain.orders[0])} className="mt-1 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 text-sm">+ Mit Angebot verknüpfen</button>
                : <p className="mt-1 text-sm text-slate-400">noch nicht angelegt</p>)}
              {step.key === "quote" && chain.quote && chain.orders.length === 1 && <button type="button" onClick={() => unlink(chain.orders[0].id)} className="mt-1 text-xs text-slate-500 hover:underline">Verknüpfung mit dem Auftrag lösen</button>}
              {actions.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {actions.map((a) => (
                    <Fragment key={a.id}>
                    <button type="button" disabled={busy !== null} onClick={() => run(a)} title={a.hint} className="px-3 py-1.5 rounded-lg bg-brand hover:bg-brand-dark text-white text-sm disabled:opacity-50">{busy === a.id ? "Wird angelegt ..." : `+ ${a.label}`}</button>
                    {(a.id === "invoice-from-order" || a.id === "invoice-from-quote") && (
                      <button type="button" disabled={busy !== null} onClick={() => runFinal(a)} title="Rechnung anlegen, fertigstellen und gleich zum Versenden öffnen - ohne Entwurf prüfen" className="px-3 py-1.5 rounded-lg border border-brand text-brand text-sm disabled:opacity-50">Rechnung gleich fertigstellen</button>
                    )}
                    {(a.id === "invoice-from-order" || a.id === "invoice-from-quote") && (
                      <HelpTip topic="quick-invoice" />
                    )}
                    {(a.id === "down-payment-from-order" || a.id === "down-payment-from-quote") && <HelpTip topic="down-payment" />}
                    </Fragment>
                  ))}
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ol>
    {linkDlg && (
      <LinkDocsDialog
        title={`Auftrag ${linkDlg.order.number ?? ""} mit einem Angebot verknüpfen`}
        intro="Offene Angebote dieses Kunden. Ein verknüpftes Angebot gilt danach als angenommen und weitergeführt."
        candidates={linkDlg.candidates}
        linkLabel="Verknüpfen"
        busy={linkBusy}
        onLink={(cand) => link(linkDlg.order.id, cand.id)}
        onClose={() => setLinkDlg(null)}
      />
    )}
    </>
  );
}
