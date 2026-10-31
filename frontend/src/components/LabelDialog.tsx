import { useState } from "react";
import { PdfLink } from "./PdfLink";

/**
 * Versandetikett (Adressaufkleber) als PDF: Größe wählen, öffnen und über den normalen Druckdialog auf den Etikettendrucker
 * drucken (dort die passende Papiergröße wählen; funktioniert mit jedem Drucker, der einen Treiber hat - Brother QL, Dymo, Zebra ...).
 */
const SIZES = [
  { key: "10x15", label: "10 × 15 cm (Versandetikett)" },
  { key: "a6", label: "A6 (105 × 148 mm)" },
  { key: "62x100", label: "62 × 100 mm (Brother QL, Endlosrolle)" },
];
const KEY = "rechnung_label_size";

export function LabelDialog({ baseUrl, title, onClose }: { baseUrl: string; title: string; onClose: () => void }) {
  const [size, setSize] = useState(() => {
    try {
      return localStorage.getItem(KEY) || "10x15";
    } catch {
      return "10x15";
    }
  });
  const [note, setNote] = useState("");

  function choose(v: string) {
    setSize(v);
    try {
      localStorage.setItem(KEY, v);
    } catch {
      // Speicher gesperrt - gilt dann nur für dieses Mal
    }
  }
  const url = `${baseUrl}?size=${size}${note.trim() ? `&note=${encodeURIComponent(note.trim())}` : ""}`;

  return (
    <div className="fixed inset-0 z-[55] bg-black/50 flex items-center justify-center p-4" role="dialog" aria-label="Versandetikett">
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center px-4 py-3 border-b border-slate-200 dark:border-slate-700">
          <h2 className="font-semibold flex-1">Versandetikett{title ? `: ${title}` : ""}</h2>
          <button onClick={onClose} className="px-3 py-1.5 rounded-lg text-sm bg-slate-100 dark:bg-slate-800" aria-label="Schließen">✕</button>
        </div>
        <div className="p-4 space-y-3 text-sm">
          <label className="block">
            Etikettengröße
            <select value={size} onChange={(e) => choose(e.target.value)} className="w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800">
              {SIZES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </label>
          <label className="block">
            Hinweis unten auf dem Etikett (optional)
            <input value={note} maxLength={80} onChange={(e) => setNote(e.target.value)} placeholder="z.B. Zerbrechlich, 0,4 kg" className="w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800" />
          </label>
          <p className="text-xs text-slate-500">Empfänger ist der Kunde des Belegs, Absender deine Firmenadresse. Das PDF öffnet sich - dort normal drucken und im Druckdialog die Papiergröße des Etiketts wählen.</p>
          <PdfLink url={url} filename="versandetikett.pdf" className="inline-block bg-brand hover:bg-brand-dark text-white px-4 py-2 rounded-lg">Etikett öffnen / drucken</PdfLink>
        </div>
      </div>
    </div>
  );
}
