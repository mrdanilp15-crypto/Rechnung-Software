import { useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import { useTextLibrary } from "./TextLibrary";

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
 * über onPick in Betreff und Nachricht übernommen. Die Standardvorlage der Belegart wird einmal automatisch eingesetzt.
 * Zusätzlich gibt es fertige Vorschläge in mehreren Tonlagen zum Ausprobieren (förmlich, freundlich, kurz, persönlich): ein Klick setzt sie
 * mit den echten Daten des Belegs ein, so liest man sofort, wie es beim Kunden klingt.
 * kind: Art der Vorlagen (Standard: die Belegart, z.B. "SHIPPED" für den Versandbescheid); extra: Versandangaben aus dem Dialog.
 */
export function TemplatePicker({
  docType,
  docId,
  onPick,
  autoApply = true,
  kind,
  extra,
}: {
  docType: DocType;
  docId: string;
  onPick: (subject: string, message: string) => void;
  autoApply?: boolean;
  kind?: string;
  extra?: { carrier?: string | null; tracking?: string | null };
}) {
  const listKind = kind ?? docType;
  const [templates, setTemplates] = useState<EmailTemplateRow[] | null>(null);
  const lib = useTextLibrary();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const applied = useRef(false);
  const suggestions = (lib?.email ?? []).filter((v) => v.kind === listKind);

  async function pick(subject: string, body: string, key: string) {
    setError(null);
    try {
      const { data } = await api.post("/templates/render", { subject, body, docType, docId, ...(extra ? { carrier: extra.carrier ?? null, tracking: extra.tracking ?? null } : {}) });
      onPick(data.subject, data.body);
      setValue(key);
    } catch (e: any) {
      setError(e?.response?.data?.error ?? "Die Vorlage konnte nicht eingesetzt werden.");
    }
  }

  useEffect(() => {
    applied.current = false;
    api.get("/templates/email", { params: { kind: listKind } }).then((r) => setTemplates(r.data)).catch(() => setTemplates([]));
  }, [listKind, docId]);

  useEffect(() => {
    if (!templates || applied.current || !autoApply) return;
    applied.current = true;
    const d = templates.find((t) => t.isDefault);
    if (d) void pick(d.subject, d.body, d.id);
    // nur einmal beim ersten Laden
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templates]);

  if (!templates || (templates.length === 0 && suggestions.length === 0)) return null;
  return (
    <label className="block text-sm">
      Vorlage
      <select
        value={value}
        onChange={(e) => {
          const v = e.target.value;
          if (v.startsWith("lib:")) {
            const s = suggestions[Number(v.slice(4))];
            if (s) void pick(s.subject, s.body, v);
          } else {
            const t = templates.find((x) => x.id === v);
            if (t) void pick(t.subject, t.body, t.id);
            else setValue("");
          }
        }}
        className="w-full mt-1 px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-sm"
      >
        <option value="">Standardtext der Software</option>
        {templates.length > 0 && (
          <optgroup label="Meine Vorlagen">
            {templates.map((t) => <option key={t.id} value={t.id}>{t.name}{t.isDefault ? " (Standard)" : ""}</option>)}
          </optgroup>
        )}
        {suggestions.length > 0 && (
          <optgroup label="Vorschläge zum Ausprobieren">
            {suggestions.map((s, i) => <option key={s.name} value={`lib:${i}`}>{s.name}</option>)}
          </optgroup>
        )}
      </select>
      {error && <span className="block text-xs text-red-600 mt-0.5">{error}</span>}
    </label>
  );
}
