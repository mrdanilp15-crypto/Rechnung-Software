import { useEffect, useState } from "react";
import { api } from "../api/client";

/**
 * Bibliothek fertiger Formulierungen (E-Mails und Begrüßung/Schlusstext der Belege) in mehreren Tonlagen - nur Vorschläge zum Ausprobieren.
 * Die Texte kommen vom Server (templates/library.ts); übernommen wird, was am besten klingt, danach ist alles frei änderbar.
 */

export type LibDocType = "QUOTE" | "ORDER_CONFIRMATION" | "DELIVERY_NOTE" | "INVOICE";

export interface EmailVariant {
  kind: string;
  name: string;
  subject: string;
  body: string;
}
export interface DocTextVariant {
  docType: LibDocType;
  name: string;
  intro: string;
  closing: string;
}
export interface TextLibraryData {
  email: EmailVariant[];
  documents: DocTextVariant[];
}

let cache: Promise<TextLibraryData> | null = null;
export function loadTextLibrary(): Promise<TextLibraryData> {
  if (!cache) {
    cache = api
      .get("/templates/library")
      .then((r) => r.data as TextLibraryData)
      .catch(() => {
        cache = null;
        return { email: [], documents: [] };
      });
  }
  return cache;
}

export function useTextLibrary(): TextLibraryData | null {
  const [data, setData] = useState<TextLibraryData | null>(null);
  useEffect(() => {
    let alive = true;
    loadTextLibrary().then((d) => alive && setData(d));
    return () => {
      alive = false;
    };
  }, []);
  return data;
}

/** Beispieldaten, damit man beim Vergleichen liest, wie der Text beim Kunden aussieht (übernommen werden die Platzhalter selbst). */
const EXAMPLE: Record<string, string> = {
  kunde: "Muster GmbH",
  ansprechpartner: "Frau Muster",
  nummer: "RE-2026-0012",
  datum: "12.03.2026",
  faellig: "26.03.2026",
  betrag: "89,90 €",
  firma: "Ihre Firma",
  versanddienst: "DHL",
  sendungsnummer: "00340434161094042557",
  sendungslink: "https://www.dhl.de/sendungsverfolgung",
};
export const withExample = (text: string) => text.replace(/\{([a-z]+)\}/gi, (m, k: string) => EXAMPLE[k.toLowerCase()] ?? m);

export const DOC_LABELS: Record<string, string> = {
  QUOTE: "Angebot",
  ORDER_CONFIRMATION: "Auftragsbestätigung",
  DELIVERY_NOTE: "Lieferschein",
  INVOICE: "Rechnung",
};

/** Knopf "Formulierungen ansehen": zeigt alle Vorschläge zur Belegart nebeneinander; übernehmen lässt sich beides oder nur ein Teil. */
export function DocTextLibraryButton({ docType, onApply, className = "" }: { docType: LibDocType; onApply: (patch: { introText?: string; closingText?: string }) => void; className?: string }) {
  const [open, setOpen] = useState(false);
  const lib = useTextLibrary();
  const list = (lib?.documents ?? []).filter((v) => v.docType === docType);
  if (lib && list.length === 0) return null;

  const apply = (patch: { introText?: string; closingText?: string }) => {
    onApply(patch);
    setOpen(false);
  };

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={`text-xs px-2 py-1 rounded border border-slate-300 dark:border-slate-600 hover:text-brand hover:border-brand ${className}`}>
        Formulierungen ansehen
      </button>
      {open && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center sm:px-4" onMouseDown={() => setOpen(false)}>
          <div className="w-full sm:max-w-2xl bg-white dark:bg-slate-800 rounded-t-xl sm:rounded-xl shadow-2xl p-5 space-y-3 max-h-[92vh] overflow-auto" onMouseDown={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-2">
              <h2 className="font-medium flex-1">Formulierungen für {DOC_LABELS[docType]}</h2>
              <button type="button" onClick={() => setOpen(false)} className="text-slate-500 hover:text-brand" aria-label="Schließen">✕</button>
            </div>
            <p className="text-xs text-slate-500">Lies die Varianten durch und übernimm, was am besten klingt - beides zusammen oder nur Begrüßung oder Schlusstext. Danach lässt sich alles frei ändern. Hier mit Beispieldaten; im Beleg werden die Platzhalter automatisch gefüllt.</p>
            {list.map((v) => (
              <div key={v.name} className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 space-y-2">
                <div className="font-medium text-sm">{v.name}</div>
                <div className="text-sm text-slate-600 dark:text-slate-300 whitespace-pre-line rounded bg-slate-50 dark:bg-slate-900/40 p-2">{withExample(v.intro)}</div>
                <div className="text-xs text-slate-400">... Positionen ...</div>
                <div className="text-sm text-slate-600 dark:text-slate-300 whitespace-pre-line rounded bg-slate-50 dark:bg-slate-900/40 p-2">{withExample(v.closing)}</div>
                <div className="flex flex-wrap gap-2 text-xs">
                  <button type="button" onClick={() => apply({ introText: v.intro, closingText: v.closing })} className="px-3 py-1.5 rounded bg-brand text-white">Beides übernehmen</button>
                  <button type="button" onClick={() => apply({ introText: v.intro })} className="px-3 py-1.5 rounded bg-slate-200 dark:bg-slate-700">Nur Begrüßung</button>
                  <button type="button" onClick={() => apply({ closingText: v.closing })} className="px-3 py-1.5 rounded bg-slate-200 dark:bg-slate-700">Nur Schlusstext</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
