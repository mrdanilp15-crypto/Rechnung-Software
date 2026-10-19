import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import { PdfLink } from "../components/PdfLink";
import { RowActionsMenu, RowAction } from "../components/RowActionsMenu";
import { MobileCard, MobileField } from "../components/MobileCard";
import { useToast } from "../components/Toast";

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
  invoiceKind?: string;
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

function statusInfo(row: DocRow): { label: string; className: string } {
  if (row.isCancellationDocument) return { label: "Korrekturbeleg", className: "bg-amber-100 text-amber-800" };
  switch (row.status) {
    case "DRAFT": return { label: "Entwurf", className: "bg-amber-100 text-amber-800" };
    case "SENT": return row.kind === "INVOICE" || row.kind === "QUOTE" ? { label: "Versendet", className: "bg-blue-100 text-blue-700" } : { label: "Fertig", className: "bg-green-100 text-green-700" };
    case "PAID": return { label: "Bezahlt", className: "bg-green-100 text-green-700" };
    case "OVERDUE": return { label: "Überfällig", className: "bg-red-100 text-red-700" };
    case "CANCELLED": return { label: "Storniert", className: "bg-slate-100 text-slate-500 line-through" };
    case "ACCEPTED": return { label: "Angenommen", className: "bg-green-100 text-green-700" };
    case "DECLINED": return { label: "Abgelehnt", className: "bg-red-100 text-red-700" };
    case "EXPIRED": return { label: "Abgelaufen", className: "bg-slate-100 text-slate-500" };
    default: return { label: row.status, className: "bg-slate-100 text-slate-600" };
  }
}

const ROW_COLUMNS = "90px 130px 1fr 90px 100px 110px 230px";

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

  async function convert(row: DocRow, path: string, targetBase: string, message: string) {
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

  function openPath(row: DocRow): string | null {
    if (row.status === "DRAFT") return `${KIND_INFO[row.kind].base}/${row.id}/edit`;
    if (row.kind === "INVOICE") return `/invoices/${row.id}`;
    return null;
  }

  function actionsFor(row: DocRow): RowAction[] {
    const list: RowAction[] = [];
    if (row.status === "DRAFT") list.push({ label: "Bearbeiten", onClick: () => navigate(openPath(row)!) });
    if (row.kind === "QUOTE" && row.status === "SENT") {
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
    if (!row.isCancellationDocument) list.push({ label: "Duplizieren", onClick: () => duplicate(row) });
    const deletable = row.kind === "INVOICE" ? row.status === "DRAFT" : row.kind === "QUOTE" ? row.status === "DRAFT" : true;
    if (deletable) list.push({ label: row.status === "DRAFT" ? "Entwurf verwerfen" : "Ungültig markieren", onClick: () => remove(row), danger: true });
    return list;
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

      <div className="flex flex-wrap items-center gap-2 mb-4">
        {chip("ALL", "Alle")}
        {chip("DRAFT", "Entwürfe")}
        {KIND_ORDER.map((k) => chip(k, KIND_INFO[k].plural))}
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Suchen (Nummer, Kunde) ..." className="ml-auto w-full sm:w-64 px-3 py-1.5 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm" />
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-lg shadow divide-y divide-slate-100 dark:divide-slate-700">
        <div className="hidden md:grid items-center gap-3 px-4 py-2 text-xs font-medium text-slate-500" style={{ gridTemplateColumns: ROW_COLUMNS }}>
          <span>Art</span>
          <span>Nummer</span>
          <span>Kunde</span>
          <span className="text-right">Datum</span>
          <span className="text-right">Betrag</span>
          <span className="text-right">Status</span>
          <span></span>
        </div>
        {visible.map((row) => {
          const st = statusInfo(row);
          const badge = <span className={`px-2 py-0.5 rounded-full text-xs ${st.className}`}>{st.label}</span>;
          const actions = (
            <div className="flex gap-2 justify-end items-center flex-wrap">
              {row.hasNext && <span className="text-xs text-green-600" title="Daraus wurde bereits ein Folgebeleg erstellt">✓ weitergeführt</span>}
              {primary(row)}
              {row.status !== "DRAFT" && (
                <PdfLink url={`${KIND_INFO[row.kind].base}/${row.id}/pdf`} filename={`${row.number ?? "beleg"}.pdf`} className="text-brand hover:underline">PDF</PdfLink>
              )}
              <RowActionsMenu actions={actionsFor(row)} />
            </div>
          );
          return (
            <div key={`${row.kind}-${row.id}`}>
              <div className="hidden md:grid items-center gap-3 px-4 py-3 text-sm" style={{ gridTemplateColumns: ROW_COLUMNS }}>
                <span className="text-slate-500">{kindLabel(row)}</span>
                <span className={`font-medium truncate ${row.number ? "" : "italic text-slate-500"}`}>{row.number ?? "Entwurf"}</span>
                <span className="truncate">{row.customerName}</span>
                <span className="text-right text-slate-500">{formatDate(row.date)}</span>
                <span className="text-right">{money(row.totalCents)}</span>
                <span className="text-right">{badge}</span>
                {actions}
              </div>
              <MobileCard title={`${kindLabel(row)} ${row.number ?? "(Entwurf)"}`} subtitle={row.customerName}>
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
        <Link to="/invoices" className="text-brand hover:underline">Rechnungen verwalten</Link> (Mehrfachauswahl, E-Mail-Status).
      </p>
    </div>
  );
}
