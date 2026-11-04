import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import type { EmailTemplateRow } from "./TemplatePicker";

/** Einstellungen → Vorlagen: E-Mail-Vorlagen je Anlass (mit Platzhaltern) und Textbausteine für Beleg-Texte. Nur für Administratoren. */

export const KIND_LABELS: Record<string, string> = {
  QUOTE: "Angebot",
  ORDER_CONFIRMATION: "Auftragsbestätigung",
  DELIVERY_NOTE: "Lieferschein",
  INVOICE: "Rechnung",
  SHIPPED: "Versandbescheid",
  OTHER: "Sonstiges",
};
const KINDS = Object.keys(KIND_LABELS);

interface Snippet {
  id: string;
  name: string;
  text: string;
}
interface Meta {
  placeholders: { key: string; description: string }[];
}

const input = "w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm";
const emptyTpl = { id: "", kind: "QUOTE", name: "", subject: "", body: "", isDefault: false };

export function TemplatesManager() {
  const [templates, setTemplates] = useState<EmailTemplateRow[]>([]);
  const [snippets, setSnippets] = useState<Snippet[]>([]);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [form, setForm] = useState<typeof emptyTpl | null>(null);
  const [snipForm, setSnipForm] = useState<{ id: string; name: string; text: string } | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const load = useCallback(() => {
    api.get("/templates/email").then((r) => setTemplates(r.data)).catch(() => undefined);
    api.get("/templates/snippets").then((r) => setSnippets(r.data)).catch(() => undefined);
  }, []);
  useEffect(() => {
    load();
    api.get("/templates/meta").then((r) => setMeta(r.data)).catch(() => undefined);
  }, [load]);

  const fail = (e: any, fallback: string) => setMsg({ ok: false, text: e?.response?.data?.error ?? fallback });

  async function saveTemplate() {
    if (!form) return;
    setMsg(null);
    const payload = { kind: form.kind, name: form.name, subject: form.subject, body: form.body, isDefault: form.isDefault };
    try {
      if (form.id) await api.patch(`/templates/email/${form.id}`, payload);
      else await api.post("/templates/email", payload);
      setForm(null);
      load();
      setMsg({ ok: true, text: "Vorlage gespeichert." });
    } catch (e) {
      fail(e, "Speichern hat nicht geklappt.");
    }
  }
  async function removeTemplate(t: EmailTemplateRow) {
    if (!window.confirm(`Vorlage "${t.name}" löschen?`)) return;
    try {
      await api.delete(`/templates/email/${t.id}`);
      load();
    } catch (e) {
      fail(e, "Löschen hat nicht geklappt.");
    }
  }
  async function examples() {
    try {
      const { data } = await api.post("/templates/email/examples");
      setMsg({ ok: true, text: data.created > 0 ? `${data.created} Beispielvorlagen angelegt - passe sie nach Bedarf an.` : "Zu allen Anlässen gibt es schon Vorlagen." });
      load();
    } catch (e) {
      fail(e, "Beispiele konnten nicht angelegt werden.");
    }
  }
  function insertPlaceholder(key: string) {
    const el = bodyRef.current;
    setForm((f) => {
      if (!f) return f;
      const start = el?.selectionStart ?? f.body.length;
      const end = el?.selectionEnd ?? f.body.length;
      return { ...f, body: f.body.slice(0, start) + key + f.body.slice(end) };
    });
  }

  async function saveSnippet() {
    if (!snipForm) return;
    setMsg(null);
    try {
      const payload = { name: snipForm.name, text: snipForm.text };
      if (snipForm.id) await api.patch(`/templates/snippets/${snipForm.id}`, payload);
      else await api.post("/templates/snippets", payload);
      setSnipForm(null);
      load();
    } catch (e) {
      fail(e, "Speichern hat nicht geklappt.");
    }
  }
  async function removeSnippet(s: Snippet) {
    if (!window.confirm(`Textbaustein "${s.name}" löschen?`)) return;
    await api.delete(`/templates/snippets/${s.id}`).catch((e) => fail(e, "Löschen hat nicht geklappt."));
    load();
  }

  return (
    <div className="space-y-6">
      {msg && <p className={`text-sm ${msg.ok ? "text-green-600" : "text-red-600"}`}>{msg.text}</p>}

      <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-medium">E-Mail-Vorlagen</h2>
          <div className="flex gap-2 text-sm">
            {templates.length === 0 && <button onClick={examples} className="px-3 py-1.5 rounded bg-slate-200 dark:bg-slate-700">Beispielvorlagen anlegen</button>}
            <button onClick={() => setForm({ ...emptyTpl })} className="px-3 py-1.5 rounded bg-brand text-white">Neue Vorlage</button>
          </div>
        </div>
        <p className="text-sm text-slate-500">
          Die Standardvorlage einer Belegart füllt beim E-Mail-Versand Betreff und Nachricht vor. Im Versanddialog lässt sich eine andere Vorlage wählen, der Text bleibt vor dem Senden änderbar.
          Der Versandbescheid wird beim Markieren eines Auftrags als "versendet" angeboten (Produktion).
        </p>

        {templates.length === 0 ? (
          <p className="text-sm text-slate-500">Noch keine Vorlagen. Ohne Vorlage verwendet die Software ihren Standardtext.</p>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-700 text-sm">
            {templates.map((t) => (
              <li key={t.id} className="py-2 flex flex-wrap items-center gap-2">
                <span className="text-xs px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700">{KIND_LABELS[t.kind] ?? t.kind}</span>
                <span className="font-medium">{t.name}</span>
                {t.isDefault && <span className="text-xs px-1.5 py-0.5 rounded bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300">Standard</span>}
                <span className="text-xs text-slate-500 truncate min-w-0 flex-1">{t.subject}</span>
                <button onClick={() => setForm({ id: t.id, kind: t.kind, name: t.name, subject: t.subject, body: t.body, isDefault: t.isDefault })} className="text-brand hover:underline">Bearbeiten</button>
                <button onClick={() => removeTemplate(t)} className="text-red-600 hover:underline">Löschen</button>
              </li>
            ))}
          </ul>
        )}

        {form && (
          <div className="rounded-lg bg-slate-50 dark:bg-slate-900/40 p-3 space-y-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <label className="block text-sm">Anlass
                <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })} className={`${input} mt-1`}>
                  {KINDS.map((k) => <option key={k} value={k}>{KIND_LABELS[k]}</option>)}
                </select>
              </label>
              <label className="block text-sm">Name der Vorlage
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="z.B. Angebot Standard" className={`${input} mt-1`} />
              </label>
            </div>
            <label className="block text-sm">Betreff
              <input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="z.B. Ihr Angebot {nummer}" className={`${input} mt-1`} />
            </label>
            <label className="block text-sm">Nachricht
              <textarea ref={bodyRef} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} rows={8} className={`${input} mt-1 font-mono`} />
            </label>
            {meta && (
              <p className="text-xs text-slate-500">
                Platzhalter einfügen:{" "}
                {meta.placeholders.map((p) => (
                  <button key={p.key} type="button" title={p.description} onClick={() => insertPlaceholder(p.key)} className="mr-1 mb-1 px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700 font-mono">{p.key}</button>
                ))}
                <span className="block mt-1">Beim Senden werden sie mit den Daten des Belegs gefüllt. Die Versandplatzhalter ({"{versanddienst}"}, {"{sendungsnummer}"}, {"{sendungslink}"}) füllt nur der Versandbescheid.</span>
              </p>
            )}
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isDefault} onChange={(e) => setForm({ ...form, isDefault: e.target.checked })} /> Standardvorlage für "{KIND_LABELS[form.kind]}" (füllt den Versanddialog automatisch vor)</label>
            <div className="flex gap-2">
              <button onClick={saveTemplate} disabled={!form.name.trim() || !form.subject.trim() || !form.body.trim()} className="px-4 py-2 rounded bg-brand text-white text-sm disabled:opacity-50">Speichern</button>
              <button onClick={() => setForm(null)} className="px-4 py-2 rounded bg-slate-200 dark:bg-slate-700 text-sm">Abbrechen</button>
            </div>
          </div>
        )}
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">Textbausteine</h2>
          <button onClick={() => setSnipForm({ id: "", name: "", text: "" })} className="px-3 py-1.5 rounded bg-brand text-white text-sm">Neuer Baustein</button>
        </div>
        <p className="text-sm text-slate-500">Kurze, wiederkehrende Sätze (Lieferzeit, Garantie, Materialhinweis, Zahlungshinweis). Beim Bearbeiten eines Belegs fügst du sie per Auswahl in Begrüßung oder Schlusstext ein. Platzhalter wie {"{kunde}"} funktionieren auch hier.</p>
        {snippets.length === 0 ? (
          <p className="text-sm text-slate-500">Noch keine Textbausteine.</p>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-700 text-sm">
            {snippets.map((s) => (
              <li key={s.id} className="py-2 flex flex-wrap items-start gap-2">
                <span className="font-medium shrink-0">{s.name}</span>
                <span className="text-xs text-slate-500 flex-1 min-w-0 whitespace-pre-line line-clamp-2">{s.text}</span>
                <button onClick={() => setSnipForm({ ...s })} className="text-brand hover:underline">Bearbeiten</button>
                <button onClick={() => removeSnippet(s)} className="text-red-600 hover:underline">Löschen</button>
              </li>
            ))}
          </ul>
        )}
        {snipForm && (
          <div className="rounded-lg bg-slate-50 dark:bg-slate-900/40 p-3 space-y-2">
            <label className="block text-sm">Name
              <input value={snipForm.name} onChange={(e) => setSnipForm({ ...snipForm, name: e.target.value })} placeholder="z.B. Lieferzeit" className={`${input} mt-1`} />
            </label>
            <label className="block text-sm">Text
              <textarea value={snipForm.text} onChange={(e) => setSnipForm({ ...snipForm, text: e.target.value })} rows={3} placeholder="z.B. Die Lieferzeit beträgt ca. 5 Werktage nach Zahlungseingang." className={`${input} mt-1`} />
            </label>
            <div className="flex gap-2">
              <button onClick={saveSnippet} disabled={!snipForm.name.trim() || !snipForm.text.trim()} className="px-4 py-2 rounded bg-brand text-white text-sm disabled:opacity-50">Speichern</button>
              <button onClick={() => setSnipForm(null)} className="px-4 py-2 rounded bg-slate-200 dark:bg-slate-700 text-sm">Abbrechen</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
