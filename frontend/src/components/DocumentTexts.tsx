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
}: {
  introText: string;
  closingText: string;
  onChange: (patch: { introText?: string; closingText?: string }) => void;
}) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-4 mb-4 space-y-3">
      <div>
        <label className="block text-sm mb-1">Begrüßung (über den Positionen)</label>
        <textarea rows={3} value={introText} onChange={(e) => onChange({ introText: e.target.value })} className={fieldClass} />
      </div>
      <div>
        <label className="block text-sm mb-1">Schlusstext (unter den Summen)</label>
        <textarea rows={4} value={closingText} onChange={(e) => onChange({ closingText: e.target.value })} className={fieldClass} />
        <PlaceholderHint />
      </div>
    </div>
  );
}
