import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import { PdfLink } from "../components/PdfLink";
import { RowActionsMenu, RowAction } from "../components/RowActionsMenu";
import { LabelDialog } from "../components/LabelDialog";
import { MobileCard, MobileField } from "../components/MobileCard";
import { useToast } from "../components/Toast";
import { RecurringDialog } from "../components/RecurringDialog";
import { StatusChip } from "../components/StatusChip";
import { SendDocumentDialog } from "../components/SendDocumentDialog";
import { LinkDocsDialog, type LinkCandidate } from "../components/LinkDocsDialog";

type Kind = "INVOICE" | "QUOTE" | "ORDER_CONFIRMATION" | "DELIVERY_NOTE";

interface DocRow {
  kind: Kind;
  id: string;
  number: string | null;
  customerName: string;
  date: string;
  dueDate: string | null;
  totalCents: number | null;
  status: string;
  isCancellationDocument: boolean;
  hasNext: boolean;
  customerId: string;
  hasSource: boolean;
  hasInvoice: boolean;
  hasOrder: boolean;
  sourceQuoteId: string | null;
  sourceOrderId: string | null;
  invoiceKind?: string;
  emailSentAt: string | null;
}

const KIND_INFO: Record<Kind, { label: string; plural: string; base: string; newPath: string }> = {
  QUOTE: { label: "Angebot", plural: "Angebote", base: "/quotes", newPath: "/quotes/new" },
  ORDER_CONFIRMATION: { label: "Auftrag", plural: "Aufträge", base: "/order-confirmations", newPath: "/order-confirmations/new" },
  DELIVERY_NOTE: { label: "Lieferschein", plural: "Lieferscheine", base: "/delivery-notes", newPath: "/delivery-notes/new" },
  INVOICE: { label: "Rechnung", plural: "Rechnungen", base: "/invoices", newPath: "/invoices/new" },
};

// Reihenfolge entspricht dem üblichen Ablauf: Angebot -> Auftrag -> Lieferschein -> Rechnung
const KIND_ORDER: Kind[] = ["QUOTE", "ORDER_CONFIRMATION", "DELIVERY_NOTE", "INVOICE"];

const kindLabel = (row: { kind: Kind; invoiceKind?: string }) =>
  row.kind === "INVOICE" && row.invoiceKind === "DOWN_PAYMENT" ? "Anzahlung" : row.kind === "INVOICE" && row.invoiceKind === "FINAL" ? "Schlussrechn." : KIND_INFO[row.kind].label;

const money = (cents: number | null) => (cents === null ? "-" : new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(cents / 100));
const formatDate = (iso?: string | null) => (iso ? new Intl.DateTimeFormat("de-DE").format(new Date(iso)) : "-");

const ROW_COLUMNS = "90px 130px 1fr 90px 100px 110px 300px";

/** Alle Belegarten in einer Liste - Entwürfe zuerst, Filter nach Art/Entwurf, Suche, Weiterführen zum nächsten Beleg. */
export default function Documents() {
  const navigate = useNavigate();
  const showToast = useToast();
  const [params, setParams] = useSearchParams();
  const filter = params.get("type") ?? "ALL";
  const [rows, setRows] = useState<DocRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [q, setQ] = useState("");
  const [newOpen, setNewOpen] = useState(false);
  const [dpRow, setDpRow] = useState<DocRow | null>(null);
  const [sendRow, setSendRow] = useState<DocRow | null>(null);
  const [labelRow, setLabelRow] = useState<DocRow | null>(null);
  const location = useLocation();
  // Nach "Fertigstellen" im Editor: Versand-Dialog gleich öffnen
  const pendingSend = (location.state as { sendEmail?: { kind: Kind; id: string } } | null)?.sendEmail;
  const [followUp, setFollowUp] = useState(false);
  // Angebot und Auftrag verknüpfen: mode "quote" = zu diesem Angebot einen vorhandenen Auftrag wählen, "order" = zu diesem Auftrag ein Angebot wählen
  const [linkDlg, setLinkDlg] = useState<{ mode: "quote" | "order"; row: DocRow; candidates: DocRow[]; onCreate?: () => void } | null>(null);
  const [linkBusy, setLinkBusy] = useState(false);
  const [recurringRow, setRecurringRow] = useState<DocRow | null>(null);
  const [dpPercent, setDpPercent] = useState("30");
  const newRef = useRef<HTMLDivElement>(null);

  function load() {
    api.get("/documents").then((res) => {
      setRows(res.data);
      setLoaded(true);
    });
  }
  useEffect(load, []);
  useEffect(() => {
    const id = params.get("followup");
    if (!id || !loaded) return;
    const row = rows.find((x) => x.kind === "QUOTE" && x.id === id);
    if (row) {
      setFollowUp(true);
      setSendRow(row);
    }
    const next = new URLSearchParams(params);
    next.delete("followup");
    setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  useEffect(() => {
    if (!pendingSend || !loaded) return;
    const row = rows.find((r) => r.kind === pendingSend.kind && r.id === pendingSend.id);
    if (row) setSendRow(row);
    navigate(location.pathname + location.search, { replace: true, state: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  useEffect(() => {
    if (!newOpen) return;
    const close = (e: MouseEvent) => {
      if (newRef.current && !newRef.current.contains(e.target as Node)) setNewOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [newOpen]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { ALL: rows.length, DRAFT: rows.filter((r) => r.status === "DRAFT").length };
    for (const k of KIND_ORDER) c[k] = rows.filter((r) => r.kind === k).length;
    return c;
  }, [rows]);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter === "DRAFT" && r.status !== "DRAFT") return false;
      if (filter !== "ALL" && filter !== "DRAFT" && r.kind !== filter) return false;
      if (needle && !`${r.number ?? ""} ${r.customerName}`.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [rows, filter, q]);

  function setFilter(value: string) {
    const next = new URLSearchParams(params);
    if (value === "ALL") next.delete("type");
    else next.set("type", value);
    setParams(next, { replace: true });
  }

  /** Aufträge desselben Kunden, die nicht aus einem Angebot stammen (Kandidaten zum Verknüpfen mit diesem Angebot). */
  const orderCandidates = (quote: DocRow) => rows.filter((r) => r.kind === "ORDER_CONFIRMATION" && r.customerId === quote.customerId && !r.hasSource && r.status !== "CANCELLED");
  /** Angebote desselben Kunden, aus denen noch kein Auftrag entstanden ist (Kandidaten zum Verknüpfen mit diesem Auftrag). */
  const quoteCandidates = (order: DocRow) => rows.filter((r) => r.kind === "QUOTE" && r.customerId === order.customerId && !r.hasOrder && ["SENT", "ACCEPTED", "EXPIRED"].includes(r.status));

  async function linkOrderToQuote(orderId: string, quoteId: string) {
    setLinkBusy(true);
    try {
      const { data } = await api.post(`/order-confirmations/${orderId}/link-quote`, { quoteId });
      showToast(`Verknüpft mit Angebot ${data.quoteNumber}${data.markedAccepted ? " (als angenommen markiert)" : ""}`, "success");
      setLinkDlg(null);
      load();
    } catch (err: any) {
      showToast(err.response?.data?.error || "Verknüpfen hat nicht geklappt", "error");
    } finally {
      setLinkBusy(false);
    }
  }

  /**
   * Gibt es für denselben Kunden und Betrag schon einen Auftrag, der nicht aus einem Angebot stammt? Dann statt eines zweiten Auftrags
   * die Auswahl "mit vorhandenem Auftrag verknüpfen" zeigen (mit der Möglichkeit, trotzdem neu anzulegen). Gibt true zurück, wenn der Dialog geöffnet wurde.
   */
  function guardOrderCreate(row: DocRow, proceed: () => void): boolean {
    if (row.kind !== "QUOTE") return false;
    const cands = orderCandidates(row);
    if (!cands.some((c) => c.totalCents === row.totalCents)) return false;
    setLinkDlg({ mode: "quote", row, candidates: cands, onCreate: proceed });
    return true;
  }

  async function convert(row: DocRow, path: string, targetBase: string, message: string, alreadyChecked = false) {
    if (!alreadyChecked && path === "convert-to-order-confirmation" && guardOrderCreate(row, () => void convert(row, path, targetBase, message, true))) return;
    try {
      const { data } = await api.post(`${KIND_INFO[row.kind].base}/${row.id}/${path}`);
      showToast(message, "success");
      navigate(`${targetBase}/${data.id}/edit`);
    } catch (err: any) {
      showToast(err.response?.data?.error || "Konnte nicht weitergeführt werden", "error");
    }
  }

  async function createDownPayment() {
    if (!dpRow) return;
    const percent = parseFloat(dpPercent.replace(",", "."));
    if (!(percent > 0 && percent <= 100)) return showToast("Bitte einen Prozentsatz zwischen 1 und 100 eingeben", "error");
    try {
      const { data } = await api.post(`${KIND_INFO[dpRow.kind].base}/${dpRow.id}/down-payment`, { percent });
      setDpRow(null);
      showToast("Anzahlungsrechnung als Entwurf angelegt", "success");
      navigate(`/invoices/${data.id}/edit`);
    } catch (err: any) {
      showToast(err.response?.data?.error || "Anzahlungsrechnung konnte nicht angelegt werden", "error");
    }
  }

  async function setQuoteStatus(row: DocRow, status: string, label: string) {
    await api.patch(`/quotes/${row.id}/status`, { status });
    showToast(`${row.number}: ${label}`, "success");
    load();
  }

  async function duplicate(row: DocRow) {
    try {
      const { data } = await api.post(`${KIND_INFO[row.kind].base}/${row.id}/duplicate`);
      showToast(`${KIND_INFO[row.kind].label} als Entwurf kopiert`, "success");
      navigate(`${KIND_INFO[row.kind].base}/${data.id}/edit`);
    } catch (err: any) {
      showToast(err.response?.data?.error || "Konnte nicht kopiert werden", "error");
    }
  }

  async function remove(row: DocRow) {
    const what = row.status === "DRAFT" ? "Entwurf verwerfen" : "als ungültig markieren";
    if (!confirm(`${KIND_INFO[row.kind].label} ${row.number ?? "(Entwurf)"} wirklich ${what}?`)) return;
    try {
      await api.delete(`${KIND_INFO[row.kind].base}/${row.id}`);
      load();
    } catch (err: any) {
      showToast(err.response?.data?.error || "Konnte nicht gelöscht werden", "error");
    }
  }

  /** Wohin führt ein Antippen des Belegs: Entwurf -> Bearbeiten, sonst die Vorgangsseite (Angebot, Auftrag, Rechnung); Lieferschein -> sein Auftrag. */
  function detailPath(row: DocRow): string | null {
    if (row.status === "DRAFT") return `${KIND_INFO[row.kind].base}/${row.id}/edit`;
    if (row.kind === "QUOTE") return `/quotes/${row.id}`;
    if (row.kind === "ORDER_CONFIRMATION") return `/orders/${row.id}`;
    if (row.kind === "INVOICE") return `/invoices/${row.id}`;
    if (row.kind === "DELIVERY_NOTE") return `/delivery-notes/${row.id}`;
    return null;
  }
  /** Ist der Beleg schon abgerechnet/weitergeführt? Beim Auftrag zählt nur eine Rechnung - ein Lieferschein allein ist noch kein Abschluss. */
  const continued = (row: DocRow) => (row.kind === "ORDER_CONFIRMATION" ? row.hasInvoice : row.hasNext);

  function openPath(row: DocRow): string | null {
    if (row.status === "DRAFT") return `${KIND_INFO[row.kind].base}/${row.id}/edit`;
    if (row.kind === "INVOICE") return `/invoices/${row.id}`;
    return null;
  }

  function actionsFor(row: DocRow): RowAction[] {
    const list: RowAction[] = [];
    if (row.status === "DRAFT") list.push({ label: "Bearbeiten", onClick: () => navigate(openPath(row)!) });
    if (row.status !== "CANCELLED" && !row.isCancellationDocument) list.push({ label: row.emailSentAt ? "Erneut per E-Mail senden" : "Per E-Mail senden", onClick: () => setSendRow(row) });
    if (row.kind === "QUOTE" && (row.status === "SENT" || row.status === "EXPIRED")) {
      list.push({ label: "Nachfassen (E-Mail vorbereitet)", onClick: () => { setFollowUp(true); setSendRow(row); } });
      list.push({ label: "Als angenommen markieren", onClick: () => setQuoteStatus(row, "ACCEPTED", "angenommen") });
      list.push({ label: "Als abgelehnt markieren", onClick: () => setQuoteStatus(row, "DECLINED", "abgelehnt") });
    }
    if (row.kind === "QUOTE" && row.status !== "DRAFT" && row.status !== "DECLINED") {
      list.push({ label: "→ Auftragsbestätigung", onClick: () => convert(row, "convert-to-order-confirmation", "/order-confirmations", "Auftragsbestätigung als Entwurf angelegt") });
    }
    if ((row.kind === "QUOTE" && row.status !== "DRAFT" && row.status !== "DECLINED") || (row.kind === "ORDER_CONFIRMATION" && row.status !== "DRAFT")) {
      list.push({ label: "→ Anzahlungsrechnung", onClick: () => { setDpPercent("30"); setDpRow(row); } });
      list.push({ label: "→ Rechnung", onClick: () => convert(row, "convert-to-invoice", "/invoices", "Rechnung als Entwurf angelegt") });
    }
    if (row.kind === "ORDER_CONFIRMATION" && row.status !== "DRAFT") {
      list.push({ label: "→ Lieferschein", onClick: () => convert(row, "convert-to-delivery-note", "/delivery-notes", "Lieferschein als Entwurf angelegt") });
    }
    if (row.kind !== "QUOTE" && row.status !== "DRAFT") list.push({ label: "Versandetikett", onClick: () => setLabelRow(row) });
    if (row.kind === "INVOICE" && !row.isCancellationDocument && row.invoiceKind !== "DOWN_PAYMENT") list.push({ label: "Wiederkehrend einrichten", onClick: () => setRecurringRow(row) });
    // nachträglich verknüpfen (z.B. wenn der Auftrag separat angelegt wurde) oder eine falsche Verknüpfung lösen
    if (row.kind === "QUOTE" && !row.hasOrder && ["SENT", "ACCEPTED", "EXPIRED"].includes(row.status) && orderCandidates(row).length > 0) {
      list.push({ label: "Mit vorhandenem Auftrag verknüpfen", onClick: () => setLinkDlg({ mode: "quote", row, candidates: orderCandidates(row) }) });
    }
    if (row.kind === "ORDER_CONFIRMATION" && !row.hasSource && quoteCandidates(row).length > 0) {
      list.push({ label: "Mit Angebot verknüpfen", onClick: () => setLinkDlg({ mode: "order", row, candidates: quoteCandidates(row) }) });
    }
    if (row.kind === "ORDER_CONFIRMATION" && row.hasSource) {
      list.push({ label: "Verknüpfung mit Angebot lösen", onClick: async () => { if (!window.confirm("Verknüpfung dieses Auftrags mit seinem Angebot lösen? Das Angebot wird dadurch wieder als nicht weitergeführt angezeigt.")) return; try { await api.post(`/order-confirmations/${row.id}/unlink-quote`); showToast("Verknüpfung gelöst", "success"); load(); } catch (err: any) { showToast(err.response?.data?.error || "Lösen hat nicht geklappt", "error"); } } });
    }
    if (!row.isCancellationDocument) list.push({ label: "Duplizieren", onClick: () => duplicate(row) });
    const deletable = row.kind === "INVOICE" ? row.status === "DRAFT" : row.kind === "QUOTE" ? row.status === "DRAFT" : true;
    if (deletable) list.push({ label: row.status === "DRAFT" ? "Entwurf verwerfen" : "Ungültig markieren", onClick: () => remove(row), danger: true });
    return list;
  }

  /** Der eine nächste Schritt je Beleg als auffälliger Knopf (alles Weitere bleibt im ⋮-Menü). */
  function nextStep(row: DocRow): { label: string; title: string; run: () => void } | null {
    if (row.status === "DRAFT" || row.isCancellationDocument || continued(row)) return null;
    if (row.kind === "QUOTE" && (row.status === "SENT" || row.status === "EXPIRED")) {
      return {
        label: "Angenommen → Auftrag",
        title: "Der Kunde hat zugesagt: Angebot als angenommen markieren und daraus die Auftragsbestätigung anlegen",
        run: async () => {
          const accept = async () => {
            await api.patch(`/quotes/${row.id}/status`, { status: "ACCEPTED" });
            void convert(row, "convert-to-order-confirmation", "/order-confirmations", "Angebot angenommen, Auftragsbestätigung als Entwurf angelegt", true);
          };
          if (guardOrderCreate(row, () => void accept())) return;
          await accept();
        },
      };
    }
    if (row.kind === "QUOTE" && row.status === "ACCEPTED") {
      return { label: "→ Auftrag anlegen", title: "Aus dem angenommenen Angebot die Auftragsbestätigung anlegen (alle Positionen werden übernommen)", run: () => convert(row, "convert-to-order-confirmation", "/order-confirmations", "Auftragsbestätigung als Entwurf angelegt") };
    }
    if (row.kind === "ORDER_CONFIRMATION") {
      return { label: "→ Rechnung", title: "Aus dem Auftrag die Rechnung als Entwurf anlegen (Lieferschein und Anzahlung über das ⋮-Menü)", run: () => convert(row, "convert-to-invoice", "/invoices", "Rechnung als Entwurf angelegt") };
    }
    return null;
  }

  function primary(row: DocRow) {
    const path = openPath(row);
    if (path) {
      return (
        <Link to={path} className={row.status === "DRAFT" ? "bg-brand hover:bg-brand-dark text-white px-3 py-1.5 rounded text-sm" : "text-brand hover:underline"}>
          {row.status === "DRAFT" ? "Weiter bearbeiten" : "Öffnen"}
        </Link>
      );
    }
    return null;
  }

  const chip = (value: string, label: string) => (
    <button
      key={value}
      onClick={() => setFilter(value)}
      className={`px-3 py-1 rounded-full text-xs border ${filter === value ? "bg-slate-900 text-white border-slate-900 dark:bg-slate-100 dark:text-slate-900" : "border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700"}`}
    >
      {label} <span className="opacity-60">{counts[value] ?? 0}</span>
    </button>
  );

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-4">
        <h1 className="text-2xl font-semibold">Belege</h1>
        <div className="flex items-center gap-4">
        <Link to="/recurring" className="text-sm text-brand hover:underline whitespace-nowrap">Wiederkehrende Rechnungen</Link>
        <Link to="/invoices" className="text-sm text-brand hover:underline whitespace-nowrap hidden sm:inline">Rechnungen verwalten</Link>
        <div className="relative" ref={newRef}>
          <button onClick={() => setNewOpen((v) => !v)} className="bg-brand hover:bg-brand-dark text-white px-4 py-2 rounded text-sm w-full sm:w-auto">
            + Neuer Beleg ▾
          </button>
          {newOpen && (
            <div className="absolute right-0 mt-1 w-56 bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 py-1 z-10 text-sm">
              {[...KIND_ORDER].reverse().map((k) => (
                <Link key={k} to={KIND_INFO[k].newPath} className="block px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-700">
                  Neue(r) {KIND_INFO[k].label}
                </Link>
              ))}
            </div>
          )}
        </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        {chip("ALL", "Alle")}
        {chip("DRAFT", "Entwürfe")}
        {KIND_ORDER.map((k) => chip(k, KIND_INFO[k].plural))}
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Suchen (Nummer, Kunde) ..." className="ml-auto w-full sm:w-64 px-3 py-1.5 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm" />
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-lg shadow divide-y divide-slate-100 dark:divide-slate-700">
        <div className="hidden xl:grid items-center gap-3 px-4 py-2 text-xs font-medium text-slate-500" style={{ gridTemplateColumns: ROW_COLUMNS }}>
          <span>Art</span>
          <span>Nummer</span>
          <span>Kunde</span>
          <span className="text-right">Datum</span>
          <span className="text-right">Betrag</span>
          <span className="text-right">Status</span>
          <span></span>
        </div>
        {visible.map((row) => {
          const badge = <StatusChip status={row.status} kind={row.kind} isCancellationDocument={row.isCancellationDocument} emailed={!!row.emailSentAt} />;
          const actions = (
            <div className="flex gap-2 justify-end items-start">
              <div className="flex gap-x-3 gap-y-2 justify-end items-center flex-wrap flex-1 min-w-0">
              {continued(row) && <span className="text-xs text-green-600" title="Daraus wurde bereits ein Folgebeleg erstellt">{row.kind === "ORDER_CONFIRMATION" ? "✓ Rechnung angelegt" : "✓ weitergeführt"}</span>}
              {row.kind === "ORDER_CONFIRMATION" && row.hasNext && !row.hasInvoice && <span className="text-xs text-slate-500" title="Zu diesem Auftrag gibt es einen Lieferschein, aber noch keine Rechnung">Lieferschein ✓</span>}
              {(() => {
                const step = nextStep(row);
                return step ? <button type="button" onClick={step.run} title={step.title} className="bg-brand hover:bg-brand-dark text-white px-3 py-1.5 rounded text-sm whitespace-nowrap">{step.label}</button> : null;
              })()}
              {primary(row)}
              {row.status !== "CANCELLED" && !row.isCancellationDocument && (
                <button type="button" onClick={() => setSendRow(row)} className="text-brand hover:underline" title={row.emailSentAt ? `Zuletzt per E-Mail gesendet am ${formatDate(row.emailSentAt)}` : "Per E-Mail an den Kunden senden (PDF im Anhang)"}>
                  {row.emailSentAt ? "✉ Erneut senden" : "✉ Senden"}
                </button>
              )}
              {row.status !== "DRAFT" && (
                <PdfLink url={`${KIND_INFO[row.kind].base}/${row.id}/pdf`} filename={`${row.number ?? "beleg"}.pdf`} className="text-brand hover:underline">PDF</PdfLink>
              )}
              </div>
              <RowActionsMenu actions={actionsFor(row)} />
            </div>
          );
          return (
            <div key={`${row.kind}-${row.id}`}>
              <div className="hidden xl:grid items-center gap-3 px-4 py-3 text-sm" style={{ gridTemplateColumns: ROW_COLUMNS }}>
                <span className="text-slate-500">{kindLabel(row)}</span>
                {detailPath(row) ? <Link to={detailPath(row)!} className={`font-medium truncate text-brand hover:underline ${row.number ? "" : "italic"}`} title="Übersicht und Folgebelege öffnen">{row.number ?? "Entwurf"}</Link> : <span className={`font-medium truncate ${row.number ? "" : "italic text-slate-500"}`}>{row.number ?? "Entwurf"}</span>}
                <span className="truncate">{row.customerName}</span>
                <span className="text-right text-slate-500">{formatDate(row.date)}</span>
                <span className="text-right">{money(row.totalCents)}</span>
                <span className="text-right">{badge}</span>
                {actions}
              </div>
              <MobileCard title={detailPath(row) ? <Link to={detailPath(row)!} className="text-brand hover:underline">{`${kindLabel(row)} ${row.number ?? "(Entwurf)"}`}</Link> : `${kindLabel(row)} ${row.number ?? "(Entwurf)"}`} subtitle={row.customerName}>
                <MobileField label="Datum" value={formatDate(row.date)} />
                <MobileField label="Betrag" value={money(row.totalCents)} />
                <MobileField label="Status" value={badge} />
                <div className="pt-2">{actions}</div>
              </MobileCard>
            </div>
          );
        })}
        {loaded && visible.length === 0 && (
          <div className="px-4 py-10 text-center text-slate-500">
            <p className="mb-3">{rows.length === 0 ? "Noch keine Belege. Legen Sie Ihre erste Rechnung an." : "Keine Belege für diesen Filter."}</p>
            {rows.length === 0 && <Link to="/invoices/new" className="bg-brand hover:bg-brand-dark text-white px-4 py-2 rounded text-sm">Erste Rechnung erstellen</Link>}
          </div>
        )}
      </div>

      {labelRow && (
        <LabelDialog
          baseUrl={`/labels/document/${labelRow.kind === "INVOICE" ? "invoices" : labelRow.kind === "DELIVERY_NOTE" ? "delivery-notes" : "order-confirmations"}/${labelRow.id}`}
          title={labelRow.number ?? ""}
          onClose={() => setLabelRow(null)}
        />
      )}
      {linkDlg && (
        <LinkDocsDialog
          title={linkDlg.mode === "quote" ? `Angebot ${linkDlg.row.number ?? ""} mit einem Auftrag verknüpfen` : `Auftrag ${linkDlg.row.number ?? ""} mit einem Angebot verknüpfen`}
          intro={linkDlg.mode === "quote" ? (linkDlg.onCreate ? `Für ${linkDlg.row.customerName} gibt es schon einen Auftrag über denselben Betrag, der nicht aus einem Angebot stammt. Verknüpfe ihn mit diesem Angebot, statt einen zweiten anzulegen.` : "Aufträge dieses Kunden, die nicht aus einem Angebot entstanden sind. Das Angebot gilt danach als angenommen und weitergeführt.") : "Offene Angebote dieses Kunden. Ein verknüpftes Angebot gilt danach als angenommen und weitergeführt."}
          candidates={linkDlg.candidates as LinkCandidate[]}
          linkLabel="Verknüpfen"
          createLabel={linkDlg.onCreate ? "Trotzdem neuen Auftrag anlegen" : undefined}
          busy={linkBusy}
          onLink={(cand) => (linkDlg.mode === "quote" ? linkOrderToQuote(cand.id, linkDlg.row.id) : linkOrderToQuote(linkDlg.row.id, cand.id))}
          onCreate={linkDlg.onCreate ? () => { const go = linkDlg.onCreate!; setLinkDlg(null); go(); } : undefined}
          onClose={() => setLinkDlg(null)}
        />
      )}
      {sendRow && (
        <SendDocumentDialog
          base={KIND_INFO[sendRow.kind].base}
          id={sendRow.id}
          label={KIND_INFO[sendRow.kind].label}
          number={sendRow.number}
          isDraft={sendRow.status === "DRAFT"}
          followUp={followUp}
          onClose={() => { setSendRow(null); setFollowUp(false); }}
          onSent={(to) => {
            setSendRow(null);
            setFollowUp(false);
            showToast(`${KIND_INFO[sendRow.kind].label} wurde an ${to} gesendet`, "success");
            load();
          }}
        />
      )}

      {recurringRow && (
        <RecurringDialog
          invoiceId={recurringRow.id}
          defaultName={`${recurringRow.customerName} - ${recurringRow.number ?? "Rechnung"}`}
          onClose={() => setRecurringRow(null)}
          onCreated={() => {
            setRecurringRow(null);
            showToast("Wiederkehrende Rechnung eingerichtet", "success");
            navigate("/recurring");
          }}
        />
      )}

      {dpRow && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center px-4" onMouseDown={() => setDpRow(null)}>
          <div className="w-full max-w-sm bg-white dark:bg-slate-800 rounded-xl shadow-2xl p-5 space-y-3" onMouseDown={(e) => e.stopPropagation()}>
            <h2 className="font-medium">Anzahlungsrechnung zu {KIND_INFO[dpRow.kind].label} {dpRow.number}</h2>
            <p className="text-sm text-slate-500">Welcher Anteil des Nettobetrags soll jetzt abgerechnet werden? Bei der Schlussrechnung wird die Anzahlung automatisch abgezogen.</p>
            <div className="flex items-center gap-2">
              <input autoFocus type="number" min={1} max={100} step="any" value={dpPercent} onChange={(e) => setDpPercent(e.target.value)} onKeyDown={(e) => e.key === "Enter" && createDownPayment()} className="w-24 px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900" />
              <span className="text-sm">% des Nettobetrags</span>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setDpRow(null)} className="px-4 py-2 rounded bg-slate-200 dark:bg-slate-700 text-sm">Abbrechen</button>
              <button onClick={createDownPayment} className="px-4 py-2 rounded bg-brand hover:bg-brand-dark text-white text-sm">Entwurf anlegen</button>
            </div>
          </div>
        </div>
      )}

      <p className="text-xs text-slate-500 mt-3">
        Der übliche Ablauf: Angebot → Auftrag → Lieferschein → Rechnung. Über das Menü (⋮) führen Sie einen Beleg mit allen Positionen zum nächsten weiter.{" "}
        <Link to="/invoices" className="text-brand hover:underline">Rechnungen verwalten</Link> (Mehrfachauswahl, E-Mail-Status) · <Link to="/recurring" className="text-brand hover:underline">Wiederkehrende Rechnungen</Link>.
      </p>
    </div>
  );
}
