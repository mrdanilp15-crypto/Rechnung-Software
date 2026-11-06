import { useEffect, useState } from "react";
import { api } from "../api/client";
import { DocTextLibraryButton, type LibDocType } from "./TextLibrary";

interface Snippet {
  id: string;
  name: string;
  text: string;
}

/** Textbausteine werden einmal geladen und für beide Felder geteilt (nach 30 s neu geholt, damit Änderungen in den Einstellungen ankommen). */
let snippetCache: { at: number; promise: Promise<Snippet[]> } | null = null;
function loadSnippets(): Promise<Snippet[]> {
  if (!snippetCache || Date.now() - snippetCache.at > 30_000) snippetCache = { at: Date.now(), promise: api.get("/templates/snippets").then((r) => r.data as Snippet[]).catch(() => []) };
  return snippetCache.promise;
}

/** Auswahl eines Textbausteins; der Text wird an das Feld angehängt (Einstellungen → Vorlagen). Ohne Bausteine erscheint nichts. */
function SnippetInsert({ onInsert }: { onInsert: (text: string) => void }) {
  const [snippets, setSnippets] = useState<Snippet[]>([]);
  useEffect(() => {
    let alive = true;
    loadSnippets().then((s) => alive && setSnippets(s));
    return () => {
      alive = false;
    };
  }, []);
  if (snippets.length === 0) return null;
  return (
    <select
      value=""
      onChange={(e) => {
        const sn = snippets.find((x) => x.id === e.target.value);
        if (sn) onInsert(sn.text);
      }}
      className="text-xs px-2 py-1 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800"
      aria-label="Textbaustein einfügen"
    >
      <option value="">Textbaustein einfügen ...</option>
      {snippets.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
    </select>
  );
}

const append = (current: string, add: string) => (current.trim() ? current.replace(/\s+$/, "") + "\n" + add : add);

const fieldClass = "w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm";

export const TEXT_PLACEHOLDERS: { key: string; description: string }[] = [
  { key: "{kunde}", description: "Name des Kunden" },
  { key: "{ansprechpartner}", description: "Ansprechpartner (sonst Kundenname)" },
  { key: "{nummer}", description: "Belegnummer" },
  { key: "{datum}", description: "Belegdatum" },
  { key: "{faellig}", description: "Fällig bis / gültig bis" },
  { key: "{betrag}", description: "Gesamtbetrag" },
  { key: "{firma}", description: "Name Ihrer Firma" },
];

/** Hinweis auf die verfügbaren Platzhalter - Klick kopiert nichts, die Liste ist reine Orientierung. */
export function PlaceholderHint() {
  return (
    <p className="text-xs text-slate-500 mt-1">
      Platzhalter, die beim PDF automatisch gefüllt werden:{" "}
      {TEXT_PLACEHOLDERS.map((p, i) => (
        <span key={p.key} title={p.description}>
          <code className="bg-slate-100 dark:bg-slate-700 px-1 rounded">{p.key}</code>
          {i < TEXT_PLACEHOLDERS.length - 1 ? " " : ""}
        </span>
      ))}
    </p>
  );
}

/** Begrüßung (über der Positionstabelle) und Schlusstext (unter den Summen) eines Belegs. */
export function DocumentTexts({
  introText,
  closingText,
  onChange,
  docType,
}: {
  introText: string;
  closingText: string;
  onChange: (patch: { introText?: string; closingText?: string }) => void;
  docType?: LibDocType;
}) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-4 mb-4 space-y-3">
      {docType && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-slate-500">Unsicher, wie es klingen soll? Schau dir fertige Formulierungen an - förmlich, freundlich, kurz oder persönlich.</p>
          <DocTextLibraryButton docType={docType} onApply={onChange} />
        </div>
      )}
      <div>
        <div className="flex items-center justify-between gap-2 mb-1">
          <label className="block text-sm">Begrüßung (über den Positionen)</label>
          <SnippetInsert onInsert={(t) => onChange({ introText: append(introText, t) })} />
        </div>
        <textarea rows={3} value={introText} onChange={(e) => onChange({ introText: e.target.value })} className={fieldClass} />
      </div>
      <div>
        <div className="flex items-center justify-between gap-2 mb-1">
          <label className="block text-sm">Schlusstext (unter den Summen)</label>
          <SnippetInsert onInsert={(t) => onChange({ closingText: append(closingText, t) })} />
        </div>
        <textarea rows={4} value={closingText} onChange={(e) => onChange({ closingText: e.target.value })} className={fieldClass} />
        <PlaceholderHint />
      </div>
    </div>
  );
}
