import { FormEvent, ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import { InfoBox } from "../components/InfoBox";
import { MobileCard } from "../components/MobileCard";
import { PdfLink } from "../components/PdfLink";
import { RowActionsMenu } from "../components/RowActionsMenu";
import { useToast } from "../components/Toast";
import { ARCHIVE_CATEGORIES, categoryLabel, formatBytes, formatDate, retainUntil } from "../lib/archive";

interface ArchiveDoc {
  id: string;
  title: string;
  category: string;
  documentDate: string;
  vendor: string | null;
  amountCents: number | null;
  notes: string | null;
  tags: string[];
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  expenseId: string | null;
  snippet: string | null;
}
interface Facets {
  categories: Record<string, number>;
  years: number[];
  tags: { tag: string; count: number }[];
  totalCount: number;
  pendingExpenseReceipts: number;
  totalSizeBytes: number;
  maxUploadMb: number;
  allowedExtensions: string[];
}
type SortKey = "date" | "title" | "vendor" | "amount" | "added" | "size";

const PAGE = 50;
const inputClass = "w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800";
const money = (cents: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(cents / 100);
const today = () => new Date().toISOString().slice(0, 10);
const canPreview = (d: ArchiveDoc) => d.mimeType === "application/pdf" || d.mimeType.startsWith("image/");
const iconFor = (mime: string) => (mime === "application/pdf" ? "📄" : mime.startsWith("image/") ? "🖼️" : mime.includes("sheet") || mime.includes("excel") || mime === "text/csv" ? "📊" : "📎");

/** Hebt die Suchwörter in einem Textausschnitt hervor. */
function Highlight({ text, query }: { text: string; query: string }): ReactNode {
  const words = query.split(/\s+/).filter(Boolean).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!words.length) return text;
  return text.split(new RegExp(`(${words.join("|")})`, "i")).map((part, i) => (i % 2 === 1 ? <mark key={i} className="bg-yellow-200 dark:bg-yellow-700/60 rounded px-0.5">{part}</mark> : part));
}

const emptyUpload = { title: "", category: "EINGANGSRECHNUNG", date: today(), vendor: "", amountEur: "", tags: "", notes: "" };

/** Belegarchiv: eigene Dokumente (Eingangsrechnungen, Quittungen, Verträge, Bescheide ...) ablegen, durchsuchen, filtern, sortieren. */
export default function Archive() {
  const showToast = useToast();
  const [params] = useSearchParams();
  const [docs, setDocs] = useState<ArchiveDoc[]>([]);
  const [total, setTotal] = useState(0);
  const [facets, setFacets] = useState<Facets | null>(null);
  const [loading, setLoading] = useState(false);

  const [qInput, setQInput] = useState(params.get("q") ?? "");
  const [q, setQ] = useState(params.get("q") ?? "");
  const [category, setCategory] = useState("");
  const [year, setYear] = useState("");
  const [tag, setTag] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sort, setSort] = useState<SortKey>("date");
  const [dir, setDir] = useState<"asc" | "desc">("desc");

  const [showUpload, setShowUpload] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [form, setForm] = useState(emptyUpload);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<{ ok: string[]; warn: string[] } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ title: "", category: "SONSTIGES", date: "", vendor: "", amountEur: "", tags: "", notes: "" });

  // Aufruf über die globale Suche (Strg+K) bei bereits geöffnetem Archiv: Suchbegriff aus der Adresse übernehmen
  const urlQ = params.get("q");
  useEffect(() => {
    if (urlQ !== null) setQInput(urlQ);
  }, [urlQ]);

  // Suchfeld mit kurzer Verzögerung, damit nicht bei jedem Tastendruck gesucht wird
  useEffect(() => {
    const t = setTimeout(() => setQ(qInput.trim()), 300);
    return () => clearTimeout(t);
  }, [qInput]);

  const queryParams = useCallback(
    () => ({ q: q || undefined, category: category || undefined, year: year || undefined, tag: tag || undefined, from: from || undefined, to: to || undefined, sort, dir }),
    [q, category, year, tag, from, to, sort, dir]
  );

  const loadFacets = useCallback(() => {
    api.get("/archive/facets").then((r) => setFacets(r.data));
  }, []);

  const loadFirstPage = useCallback(() => {
    setLoading(true);
    api
      .get("/archive", { params: { ...queryParams(), limit: PAGE, offset: 0 } })
      .then((r) => {
        setDocs(r.data.items);
        setTotal(r.data.total);
      })
      .finally(() => setLoading(false));
  }, [queryParams]);

  useEffect(loadFirstPage, [loadFirstPage]);
  useEffect(loadFacets, [loadFacets]);

  async function loadMore() {
    setLoading(true);
    try {
      const r = await api.get("/archive", { params: { ...queryParams(), limit: PAGE, offset: docs.length } });
      setDocs((d) => [...d, ...r.data.items]);
      setTotal(r.data.total);
    } finally {
      setLoading(false);
    }
  }

  const filtersActive = !!(q || category || year || tag || from || to);
  function resetFilters() {
    setQInput("");
    setQ("");
    setCategory("");
    setYear("");
    setTag("");
    setFrom("");
    setTo("");
  }
  function toggleSort(key: SortKey) {
    if (sort === key) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSort(key);
      setDir(key === "title" || key === "vendor" ? "asc" : "desc");
    }
  }
  const sortMark = (key: SortKey) => (sort === key ? (dir === "asc" ? " ▲" : " ▼") : "");

  // ---------- Hochladen ----------
  function addFiles(list: FileList | File[]) {
    // Sofort in ein Array kopieren: Die FileList des Eingabefelds ist "live" und wäre beim verzögert laufenden Update schon geleert.
    const incoming = Array.from(list);
    setFiles((cur) => {
      const next = [...cur];
      for (const f of incoming) if (!next.some((x) => x.name === f.name && x.size === f.size)) next.push(f);
      return next.slice(0, 20);
    });
  }

  async function submitUpload(e: FormEvent) {
    e.preventDefault();
    if (files.length === 0) return;
    const tooBig = facets ? files.filter((f) => f.size > facets.maxUploadMb * 1024 * 1024) : [];
    if (tooBig.length) {
      setUploadMsg({ ok: [], warn: tooBig.map((f) => `"${f.name}" ist größer als ${facets!.maxUploadMb} MB.`) });
      return;
    }
    setBusy(true);
    setUploadMsg(null);
    const fd = new FormData();
    files.forEach((f) => fd.append("files", f));
    fd.append("category", form.category);
    if (form.date) fd.append("documentDate", form.date);
    if (form.vendor) fd.append("vendor", form.vendor);
    if (form.tags) fd.append("tags", form.tags);
    if (form.notes) fd.append("notes", form.notes);
    if (files.length === 1) {
      if (form.title) fd.append("title", form.title);
      if (form.amountEur) fd.append("amountCents", String(Math.round(parseFloat(form.amountEur.replace(",", ".")) * 100)));
    }
    try {
      const { data } = await api.post("/archive", fd, { headers: { "Content-Type": "multipart/form-data" } });
      const ok = data.created.length ? [`${data.created.length} Dokument(e) abgelegt.`] : [];
      const warn = [
        ...data.skipped.map((s: any) => `"${s.fileName}": ${s.reason}${s.existingTitle ? ` (als "${s.existingTitle}")` : ""}.`),
        ...data.rejected.map((s: any) => `"${s.fileName}": ${s.reason}.`),
      ];
      setUploadMsg({ ok, warn });
      if (data.created.length) {
        setFiles([]);
        setForm({ ...emptyUpload, category: form.category, date: form.date });
        loadFirstPage();
        loadFacets();
        showToast(`${data.created.length} Dokument(e) abgelegt`, "success");
      }
    } catch (err: any) {
      setUploadMsg({ ok: [], warn: [err.response?.data?.error || "Hochladen fehlgeschlagen."] });
    } finally {
      setBusy(false);
    }
  }

  // ---------- Bearbeiten / Löschen ----------
  function startEdit(d: ArchiveDoc) {
    setEditingId(d.id);
    setEditForm({ title: d.title, category: d.category, date: d.documentDate.slice(0, 10), vendor: d.vendor ?? "", amountEur: d.amountCents == null ? "" : (d.amountCents / 100).toFixed(2), tags: d.tags.join(", "), notes: d.notes ?? "" });
  }

  async function submitEdit(e: FormEvent) {
    e.preventDefault();
    if (!editingId) return;
    try {
      await api.patch(`/archive/${editingId}`, {
        title: editForm.title,
        category: editForm.category,
        documentDate: editForm.date,
        vendor: editForm.vendor || null,
        amountCents: editForm.amountEur ? Math.round(parseFloat(editForm.amountEur.replace(",", ".")) * 100) : null,
        tags: editForm.tags,
        notes: editForm.notes || null,
      });
      setEditingId(null);
      loadFirstPage();
      loadFacets();
      showToast("Gespeichert", "success");
    } catch (err: any) {
      alert(err.response?.data?.error || "Speichern fehlgeschlagen.");
    }
  }

  async function remove(d: ArchiveDoc) {
    const until = retainUntil(d.category, d.documentDate);
    const warning = until && until > new Date() ? `\n\nAchtung: Für diese Art von Beleg gilt eine Aufbewahrungsfrist bis ${formatDate(until)}. Vorher sollte er nicht gelöscht werden.` : "";
    if (!confirm(`"${d.title}" endgültig löschen?${warning}\n\nDie Datei wird unwiderruflich entfernt (nur in Backups bleibt sie erhalten).`)) return;
    await api.delete(`/archive/${d.id}`);
    loadFirstPage();
    loadFacets();
    showToast("Dokument gelöscht", "success");
  }

  async function importExpenseReceipts() {
    setImporting(true);
    try {
      const { data } = await api.post("/archive/import-expense-receipts");
      const done = data.created + data.linked;
      showToast(`${done} Beleg(e) übernommen${data.missing ? `, ${data.missing} Datei(en) nicht gefunden` : ""}`, done ? "success" : "info");
      loadFirstPage();
      loadFacets();
    } catch (err: any) {
      alert(err.response?.data?.error || "Übernahme fehlgeschlagen.");
    } finally {
      setImporting(false);
    }
  }

  async function exportZip() {
    try {
      const res = await api.get("/archive/export/zip", { params: queryParams(), responseType: "blob" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(res.data);
      link.download = `belegarchiv-${today()}.zip`;
      link.click();
    } catch {
      alert("Keine Dokumente zum Exportieren oder Export fehlgeschlagen.");
    }
  }

  const actionsFor = (d: ArchiveDoc) => (
    <div className="flex gap-3 justify-end items-center shrink-0 text-sm">
      {canPreview(d) && (
        <PdfLink url={`/archive/${d.id}/file`} filename={d.fileName} className="text-brand hover:underline">
          Ansehen
        </PdfLink>
      )}
      <PdfLink url={`/archive/${d.id}/file?download=1`} filename={d.fileName} download className="text-brand hover:underline">
        Laden
      </PdfLink>
      <RowActionsMenu actions={[{ label: "Bearbeiten", onClick: () => startEdit(d) }, { label: "Löschen", onClick: () => remove(d), danger: true }]} />
    </div>
  );

  const tagChips = (d: ArchiveDoc) =>
    d.tags.length > 0 && (
      <div className="flex flex-wrap gap-1 mt-1">
        {d.tags.map((t) => (
          <button key={t} type="button" onClick={() => setTag(t)} className="text-xs px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600" title="Nach diesem Tag filtern">
            #{t}
          </button>
        ))}
      </div>
    );

  const snippetLine = (d: ArchiveDoc) =>
    d.snippet && (
      <div className="text-xs text-slate-500 mt-1 line-clamp-2">
        <span className="text-slate-400">Im Dokument: </span>
        <Highlight text={d.snippet} query={q} />
      </div>
    );

  const editForm$ = (
    <form onSubmit={submitEdit} className="grid grid-cols-1 sm:grid-cols-3 gap-3 px-4 py-3 bg-slate-50 dark:bg-slate-900/40 border-t border-slate-100 dark:border-slate-700 text-sm">
      <label className="sm:col-span-2 block">Titel<input required value={editForm.title} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} className={`${inputClass} mt-1`} /></label>
      <label className="block">Kategorie
        <select value={editForm.category} onChange={(e) => setEditForm({ ...editForm, category: e.target.value })} className={`${inputClass} mt-1`}>
          {ARCHIVE_CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
        </select>
      </label>
      <label className="block">Belegdatum<input type="date" required value={editForm.date} onChange={(e) => setEditForm({ ...editForm, date: e.target.value })} className={`${inputClass} mt-1`} /></label>
      <label className="block">Aussteller / Absender<input value={editForm.vendor} onChange={(e) => setEditForm({ ...editForm, vendor: e.target.value })} className={`${inputClass} mt-1`} /></label>
      <label className="block">Betrag (€, optional)<input type="number" min="0" step="0.01" value={editForm.amountEur} onChange={(e) => setEditForm({ ...editForm, amountEur: e.target.value })} className={`${inputClass} mt-1`} /></label>
      <label className="sm:col-span-3 block">Tags (mit Komma trennen)<input value={editForm.tags} onChange={(e) => setEditForm({ ...editForm, tags: e.target.value })} list="archive-tags" className={`${inputClass} mt-1`} /></label>
      <label className="sm:col-span-3 block">Notizen<textarea rows={2} value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} className={`${inputClass} mt-1`} /></label>
      <div className="sm:col-span-3 flex gap-2">
        <button type="submit" className="flex-1 bg-brand hover:bg-brand-dark text-white py-2 rounded">Speichern</button>
        <button type="button" onClick={() => setEditingId(null)} className="px-4 py-2 rounded bg-slate-200 dark:bg-slate-700">Abbrechen</button>
      </div>
    </form>
  );

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-4">
        <h1 className="text-2xl font-semibold">Belegarchiv</h1>
        <div className="flex gap-2">
          <button onClick={exportZip} disabled={total === 0} className="px-4 py-2 rounded text-sm bg-slate-200 dark:bg-slate-700 disabled:opacity-50" title="Alle Dokumente der aktuellen Auswahl als ZIP mit Übersichtsliste (Excel-tauglich)">
            ZIP-Export{filtersActive ? " (Auswahl)" : ""}
          </button>
          <button onClick={() => { setShowUpload((v) => !v); setUploadMsg(null); }} className="bg-brand hover:bg-brand-dark text-white px-4 py-2 rounded text-sm">
            {showUpload ? "Schließen" : "+ Dokumente ablegen"}
          </button>
        </div>
      </div>

      <InfoBox title="Wofür ist das Belegarchiv?">
        <p>Hier legen Sie alle Unterlagen Ihres Unternehmens ab, die nicht in der Rechnungs-Software entstehen: <strong>Eingangsrechnungen, Quittungen, Kontoauszüge, Verträge, Versicherungen, Bescheide vom Finanzamt, Schriftverkehr</strong> - als PDF, Foto/Scan, Excel/Word oder Textdatei.</p>
        <p><strong>Suche:</strong> Sie finden Dokumente über Titel, Aussteller, Notizen, Tags, Dateiname <em>und über den Text im PDF</em> (bei Scans/Fotos ohne Textebene nur über Titel, Aussteller, Tags und Notizen - deshalb dort bitte einen aussagekräftigen Titel vergeben). Mehrere Suchwörter müssen alle vorkommen.</p>
        <p><strong>Filtern &amp; Sortieren:</strong> nach Kategorie, Jahr, Zeitraum und Tag; sortieren per Klick auf die Spaltenüberschriften. <strong>Tags</strong> sind eigene Schlagworte (z.B. "strom", "büro", "2026"), per Klick auf einen Tag filtern Sie danach.</p>
        <p><strong>Aufbewahrung:</strong> Buchungsbelege (Rechnungen, Quittungen, Kontoauszüge) müssen 8 Jahre, Geschäftsbriefe 6 Jahre aufbewahrt werden - jeweils ab Ende des Kalenderjahres des Belegdatums. Das Archiv zeigt die Frist an und warnt vor dem Löschen. Die Dateien sind im täglichen Backup enthalten. Alles Weitere (z.B. Verfahrensdokumentation) klären Sie bitte mit Ihrem Steuerberater.</p>
        <p>Dieselbe Datei kann nicht doppelt abgelegt werden - die Software erkennt Duplikate. Belege, die Sie bei einer <em>Ausgabe</em> (Finanzen → Ausgaben) hochladen, werden automatisch auch hier abgelegt (Kennzeichnung "aus Ausgabe"); bisherige übernehmen Sie über den Hinweis oben auf dieser Seite.</p>
      </InfoBox>

      {showUpload && (
        <form onSubmit={submitUpload} className="bg-white dark:bg-slate-800 rounded-lg shadow p-4 mb-5 space-y-4">
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files); }}
            onClick={() => fileInput.current?.click()}
            className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer text-sm ${dragOver ? "border-brand bg-blue-50 dark:bg-slate-700" : "border-slate-300 dark:border-slate-600"}`}
          >
            <p className="font-medium">Dateien hierher ziehen oder klicken zum Auswählen</p>
            <p className="text-xs text-slate-500 mt-1">
              Bis zu 20 Dateien gleichzeitig, je maximal {facets?.maxUploadMb ?? 25} MB. Erlaubt: PDF, Fotos (JPG, PNG, WebP, GIF), Word/Excel/LibreOffice, CSV, Text, XML, ZIP.
            </p>
            <input ref={fileInput} type="file" multiple hidden accept={facets?.allowedExtensions.join(",")} onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; }} />
          </div>
          {files.length > 0 && (
            <ul className="text-sm divide-y divide-slate-100 dark:divide-slate-700 border border-slate-200 dark:border-slate-700 rounded">
              {files.map((f) => (
                <li key={f.name + f.size} className="flex justify-between items-center gap-3 px-3 py-1.5">
                  <span className="truncate">{f.name} <span className="text-xs text-slate-500">({formatBytes(f.size)})</span></span>
                  <button type="button" onClick={() => setFiles((cur) => cur.filter((x) => x !== f))} className="text-red-500 px-1" aria-label="Entfernen">✕</button>
                </li>
              ))}
            </ul>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {files.length <= 1 ? (
              <label className="block text-sm sm:col-span-2">Titel
                <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="z.B. Stromrechnung Oktober 2026 (leer = Dateiname)" className={`${inputClass} mt-1`} />
                <span className="block text-xs text-slate-500 mt-0.5">Unter diesem Namen finden Sie das Dokument wieder - besonders bei Scans und Fotos wichtig.</span>
              </label>
            ) : (
              <p className="text-xs text-slate-500 sm:col-span-2 self-center">Bei mehreren Dateien dient der Dateiname als Titel (später änderbar). Kategorie, Datum, Aussteller, Tags und Notiz gelten für alle.</p>
            )}
            <label className="block text-sm">Kategorie
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className={`${inputClass} mt-1`}>
                {ARCHIVE_CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
              </select>
              <span className="block text-xs text-slate-500 mt-0.5">{ARCHIVE_CATEGORIES.find((c) => c.key === form.category)?.hint}</span>
            </label>
            <label className="block text-sm">Belegdatum
              <input type="date" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className={`${inputClass} mt-1`} />
              <span className="block text-xs text-slate-500 mt-0.5">Datum auf dem Dokument (nicht heutiges Datum) - danach richten sich Jahresfilter und Aufbewahrungsfrist.</span>
            </label>
            <label className="block text-sm">Aussteller / Absender
              <input value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })} placeholder="z.B. Stadtwerke, Finanzamt, Baumarkt" className={`${inputClass} mt-1`} />
            </label>
            {files.length <= 1 && (
              <label className="block text-sm">Betrag (€, optional)
                <input type="number" min="0" step="0.01" value={form.amountEur} onChange={(e) => setForm({ ...form, amountEur: e.target.value })} className={`${inputClass} mt-1`} />
                <span className="block text-xs text-slate-500 mt-0.5">Gesamtbetrag brutto, falls vorhanden - zum Sortieren und Wiederfinden.</span>
              </label>
            )}
            <label className="block text-sm sm:col-span-3">Tags (optional, mit Komma trennen)
              <input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} list="archive-tags" placeholder="z.B. strom, fixkosten, 2026" className={`${inputClass} mt-1`} />
              <span className="block text-xs text-slate-500 mt-0.5">Eigene Schlagworte, nach denen Sie später filtern. Vorhandene Tags werden beim Tippen vorgeschlagen.</span>
            </label>
            <label className="block text-sm sm:col-span-3">Notiz (optional)
              <textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className={`${inputClass} mt-1`} />
            </label>
          </div>
          {uploadMsg && (
            <div className="text-sm space-y-0.5">
              {uploadMsg.ok.map((m) => <p key={m} className="text-green-600">{m}</p>)}
              {uploadMsg.warn.map((m) => <p key={m} className="text-amber-600">{m}</p>)}
            </div>
          )}
          <div className="flex gap-2">
            <button type="submit" disabled={busy || files.length === 0} className="flex-1 bg-brand hover:bg-brand-dark text-white py-2 rounded disabled:opacity-60">
              {busy ? "Wird hochgeladen ..." : files.length > 1 ? `${files.length} Dokumente ablegen` : "Dokument ablegen"}
            </button>
          </div>
        </form>
      )}

      {facets && facets.pendingExpenseReceipts > 0 && (
        <div className="rounded-lg border border-blue-200 dark:border-slate-600 bg-blue-50 dark:bg-slate-800/60 p-3 mb-4 text-sm flex flex-wrap items-center justify-between gap-3">
          <span>
            <strong>{facets.pendingExpenseReceipts}</strong> Beleg(e) von Ausgaben (Finanzen → Ausgaben) liegen noch nicht im Archiv. Neue Ausgaben mit Beleg werden automatisch abgelegt, die bisherigen übernehmen Sie hier mit einem Klick (die Dateien an den Ausgaben bleiben unverändert).
          </span>
          <button type="button" onClick={importExpenseReceipts} disabled={importing} className="bg-brand hover:bg-brand-dark text-white px-4 py-2 rounded disabled:opacity-60 shrink-0">
            {importing ? "Wird übernommen ..." : "Jetzt ins Archiv übernehmen"}
          </button>
        </div>
      )}

      <datalist id="archive-tags">{facets?.tags.map((t) => <option key={t.tag} value={t.tag} />)}</datalist>

      {/* Suche und Filter */}
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-3 mb-4 space-y-3">
        <input value={qInput} onChange={(e) => setQInput(e.target.value)} placeholder="Suchen: Titel, Aussteller, Notiz, Tag, Dateiname oder Text im PDF ..." className={inputClass} aria-label="Suche" />
        <div className="grid grid-cols-2 md:grid-cols-6 gap-2 text-sm">
          <select value={category} onChange={(e) => setCategory(e.target.value)} className={inputClass} aria-label="Kategorie">
            <option value="">Alle Kategorien</option>
            {ARCHIVE_CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}{facets?.categories[c.key] ? ` (${facets.categories[c.key]})` : ""}</option>)}
          </select>
          <select value={year} onChange={(e) => { setYear(e.target.value); setFrom(""); setTo(""); }} className={inputClass} aria-label="Jahr">
            <option value="">Alle Jahre</option>
            {facets?.years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <select value={tag} onChange={(e) => setTag(e.target.value)} className={inputClass} aria-label="Tag">
            <option value="">Alle Tags</option>
            {facets?.tags.map((t) => <option key={t.tag} value={t.tag}>#{t.tag} ({t.count})</option>)}
          </select>
          <label className="flex items-center gap-1 text-xs text-slate-500">von<input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setYear(""); }} className={inputClass} /></label>
          <label className="flex items-center gap-1 text-xs text-slate-500">bis<input type="date" value={to} onChange={(e) => { setTo(e.target.value); setYear(""); }} className={inputClass} /></label>
          <div className="flex gap-1">
            <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className={inputClass} aria-label="Sortieren nach">
              <option value="date">Belegdatum</option>
              <option value="title">Titel</option>
              <option value="vendor">Aussteller</option>
              <option value="amount">Betrag</option>
              <option value="added">Hinzugefügt</option>
              <option value="size">Dateigröße</option>
            </select>
            <button type="button" onClick={() => setDir((d) => (d === "asc" ? "desc" : "asc"))} className="px-3 rounded border border-slate-300 dark:border-slate-600" title={dir === "asc" ? "Aufsteigend" : "Absteigend"} aria-label="Sortierrichtung umkehren">
              {dir === "asc" ? "▲" : "▼"}
            </button>
          </div>
        </div>
        <div className="flex justify-between items-center text-xs text-slate-500">
          <span>
            {loading && docs.length === 0 ? "Lädt ..." : `${total} ${total === 1 ? "Dokument" : "Dokumente"}${filtersActive ? " gefunden" : ""}`}
            {facets && !filtersActive ? ` · ${formatBytes(facets.totalSizeBytes)} belegt` : ""}
          </span>
          {filtersActive && <button type="button" onClick={resetFilters} className="text-brand hover:underline">Filter zurücksetzen</button>}
        </div>
      </div>

      {/* Liste */}
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow divide-y divide-slate-100 dark:divide-slate-700">
        <div className="hidden md:grid gap-3 px-4 py-2 text-xs font-medium text-slate-500" style={{ gridTemplateColumns: "minmax(0,1fr) 190px 95px 100px 190px" }}>
          <button type="button" onClick={() => toggleSort("title")} className="text-left hover:text-slate-800 dark:hover:text-slate-200">Dokument{sortMark("title")}</button>
          <button type="button" onClick={() => toggleSort("vendor")} className="text-left hover:text-slate-800 dark:hover:text-slate-200">Kategorie / Aussteller{sortMark("vendor")}</button>
          <button type="button" onClick={() => toggleSort("date")} className="text-left hover:text-slate-800 dark:hover:text-slate-200">Datum{sortMark("date")}</button>
          <button type="button" onClick={() => toggleSort("amount")} className="text-right hover:text-slate-800 dark:hover:text-slate-200">Betrag{sortMark("amount")}</button>
          <span />
        </div>
        {docs.map((d) => {
          const until = retainUntil(d.category, d.documentDate);
          return (
            <div key={d.id}>
              <div className="hidden md:grid items-start gap-3 px-4 py-3 text-sm" style={{ gridTemplateColumns: "minmax(0,1fr) 190px 95px 100px 190px" }}>
                <div className="min-w-0">
                  <div className="font-medium truncate"><span className="mr-1.5">{iconFor(d.mimeType)}</span><Highlight text={d.title} query={q} /></div>
                  <div className="text-xs text-slate-500 truncate">{d.fileName} · {formatBytes(d.sizeBytes)}{d.expenseId ? " · aus Ausgabe" : ""}</div>
                  {d.notes && <div className="text-xs text-slate-500 truncate" title={d.notes}>{d.notes}</div>}
                  {tagChips(d)}
                  {snippetLine(d)}
                </div>
                <div className="min-w-0">
                  <button type="button" onClick={() => setCategory(d.category)} className="text-xs px-2 py-0.5 rounded bg-blue-50 dark:bg-slate-700 text-brand hover:underline" title={`Nur "${categoryLabel(d.category)}" anzeigen`}>{categoryLabel(d.category)}</button>
                  {d.vendor && <div className="text-xs text-slate-600 dark:text-slate-300 truncate mt-0.5">{d.vendor}</div>}
                  {until && <div className="text-xs text-slate-400" title="Ende der gesetzlichen Aufbewahrungsfrist">Aufbewahren bis {formatDate(until)}</div>}
                </div>
                <span>{formatDate(d.documentDate)}</span>
                <span className="text-right">{d.amountCents == null ? <span className="text-slate-400">-</span> : money(d.amountCents)}</span>
                {actionsFor(d)}
              </div>
              <MobileCard
                title={<><span className="mr-1">{iconFor(d.mimeType)}</span>{d.title}</>}
                subtitle={[categoryLabel(d.category), d.vendor, formatDate(d.documentDate)].filter(Boolean).join(" · ")}
                actions={actionsFor(d)}
              >
                <div className="text-xs text-slate-500 mt-1">{d.fileName} · {formatBytes(d.sizeBytes)}{d.amountCents != null ? ` · ${money(d.amountCents)}` : ""}{d.expenseId ? " · aus Ausgabe" : ""}</div>
                {tagChips(d)}
                {snippetLine(d)}
              </MobileCard>
              {editingId === d.id && editForm$}
            </div>
          );
        })}
        {docs.length === 0 && !loading && (
          <p className="px-4 py-8 text-center text-slate-500 text-sm">
            {filtersActive ? "Keine Dokumente für diese Suche/Filter gefunden." : 'Noch nichts abgelegt. Mit "+ Dokumente ablegen" laden Sie Ihr erstes Dokument hoch.'}
          </p>
        )}
      </div>
      {docs.length < total && (
        <div className="text-center mt-4">
          <button onClick={loadMore} disabled={loading} className="px-4 py-2 rounded bg-slate-200 dark:bg-slate-700 text-sm disabled:opacity-60">
            {loading ? "Lädt ..." : `Weitere laden (${total - docs.length} übrig)`}
          </button>
        </div>
      )}
    </div>
  );
}
