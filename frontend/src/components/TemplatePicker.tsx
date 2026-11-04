import { useEffect, useRef, useState } from "react";
import { api } from "../api/client";

export interface EmailTemplateRow {
  id: string;
  kind: string;
  name: string;
  subject: string;
  body: string;
  isDefault: boolean;
}

export type DocType = "QUOTE" | "ORDER_CONFIRMATION" | "DELIVERY_NOTE" | "INVOICE";

/** Belegart aus dem API-Pfad der Liste (z.B. /quotes) */
export const docTypeForBase = (base: string): DocType | null =>
  base.startsWith("/quotes") ? "QUOTE" : base.startsWith("/order-confirmations") ? "ORDER_CONFIRMATION" : base.startsWith("/delivery-notes") ? "DELIVERY_NOTE" : base.startsWith("/invoices") ? "INVOICE" : null;

/**
 * Auswahl einer E-Mail-Vorlage für einen Beleg. Die Vorlage wird mit den Daten des Belegs gefüllt (Name, Nummer, Betrag, Fälligkeit ...) und
 * über onPick in Betreff und Nachricht übernommen. Die Standardvorlage der Belegart wird einmal automatisch eingesetzt. Gibt es keine Vorlage, erscheint nichts.
 */
export function TemplatePicker({ docType, docId, onPick }: { docType: DocType; docId: string; onPick: (subject: string, message: string) => void }) {
  const [templates, setTemplates] = useState<EmailTemplateRow[] | null>(null);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const applied = useRef(false);

  async function pick(t: EmailTemplateRow) {
    setError(null);
    try {
      const { data } = await api.post("/templates/render", { subject: t.subject, body: t.body, docType, docId });
      onPick(data.subject, data.body);
      setValue(t.id);
    } catch (e: any) {
      setError(e?.response?.data?.error ?? "Die Vorlage konnte nicht eingesetzt werden.");
    }
  }

  useEffect(() => {
    applied.current = false;
    api.get("/templates/email", { params: { kind: docType } }).then((r) => setTemplates(r.data)).catch(() => setTemplates([]));
  }, [docType, docId]);

  useEffect(() => {
    if (!templates || applied.current) return;
    applied.current = true;
    const d = templates.find((t) => t.isDefault);
    if (d) void pick(d);
    // nur einmal beim ersten Laden
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templates]);

  if (!templates || templates.length === 0) return null;
  return (
    <label className="block text-sm">
      Vorlage
      <select
        value={value}
        onChange={(e) => {
          const t = templates.find((x) => x.id === e.target.value);
          if (t) void pick(t);
          else setValue("");
        }}
        className="w-full mt-1 px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-sm"
      >
        <option value="">Standardtext der Software</option>
        {templates.map((t) => <option key={t.id} value={t.id}>{t.name}{t.isDefault ? " (Standard)" : ""}</option>)}
      </select>
      {error && <span className="block text-xs text-red-600 mt-0.5">{error}</span>}
    </label>
  );
}
