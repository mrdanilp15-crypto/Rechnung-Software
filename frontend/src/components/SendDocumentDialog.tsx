import { useEffect, useState } from "react";
import { api } from "../api/client";

/**
 * Beleg (Angebot, Auftragsbestätigung, Lieferschein) per E-Mail verschicken: Empfänger, Betreff und Text prüfen/ändern,
 * das PDF hängt automatisch an. Ein Entwurf wird beim Senden fertiggestellt. "Fertigstellen" allein verschickt nichts.
 */
export function SendDocumentDialog({
  base,
  id,
  label,
  number,
  isDraft,
  onClose,
  onSent,
}: {
  base: string; // z.B. /quotes
  id: string;
  label: string; // z.B. Angebot
  number: string | null;
  isDraft: boolean;
  onClose: () => void;
  onSent: (to: string) => void;
}) {
  const [to, setTo] = useState("");
  const [customerEmail, setCustomerEmail] = useState<string | null | undefined>(undefined);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [copyToSelf, setCopyToSelf] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get(`${base}/${id}`)
      .then((r) => {
        const email = r.data.customer?.email ?? null;
        setCustomerEmail(email);
        setTo(email ?? "");
      })
      .catch(() => setCustomerEmail(null));
  }, [base, id]);

  async function send() {
    setSending(true);
    setError(null);
    try {
      const { data } = await api.post(`${base}/${id}/send-email`, { to: to.trim() || undefined, subject: subject.trim() || undefined, message: message.trim() || undefined, copyToSelf: copyToSelf || undefined });
      onSent(data.sentTo ?? to);
    } catch (err: any) {
      setError(err.response?.data?.error || "E-Mail konnte nicht gesendet werden.");
    } finally {
      setSending(false);
    }
  }

  const inputClass = "w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-sm";
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center sm:px-4" onMouseDown={onClose}>
      <div className="w-full sm:max-w-lg bg-white dark:bg-slate-800 rounded-t-xl sm:rounded-xl shadow-2xl p-5 space-y-3 max-h-[92vh] overflow-auto" onMouseDown={(e) => e.stopPropagation()}>
        <h2 className="font-medium">{label} {number ?? ""} per E-Mail senden</h2>
        {isDraft && (
          <p className="text-xs text-amber-700 dark:text-amber-400">
            {label === "Rechnung"
              ? "Beim Senden wird die fortlaufende Rechnungsnummer vergeben - danach ist die Rechnung nicht mehr änderbar."
              : "Dieser Entwurf wird beim Senden fertiggestellt (das PDF trägt danach kein Entwurfs-Wasserzeichen mehr)."}
          </p>
        )}
        {!isDraft && <p className="text-xs text-slate-500">Dieser Beleg ist schon fertig - Sie können ihn beliebig oft erneut verschicken (z.B. wenn die erste E-Mail nicht angekommen ist oder der Kunde sie verloren hat).</p>}
        <label className="block text-sm">
          Empfänger
          <input type="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="E-Mail-Adresse des Kunden" className={`${inputClass} mt-1`} autoFocus />
          {customerEmail === null && <span className="block text-xs text-amber-600 mt-0.5">Beim Kunden ist keine E-Mail-Adresse hinterlegt - bitte hier eintragen (oder beim Kunden ergänzen).</span>}
        </label>
        <label className="block text-sm">
          Betreff (optional)
          <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder={`${label} ${number ?? ""}`.trim()} className={`${inputClass} mt-1`} />
        </label>
        <label className="block text-sm">
          Nachricht (optional)
          <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={5} placeholder="Leer lassen für den Standardtext (Anrede, Hinweis auf den Anhang, Gruß)." className={`${inputClass} mt-1`} />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={copyToSelf} onChange={(e) => setCopyToSelf(e.target.checked)} />
          Kopie an mich senden (verdeckt, an Ihre Absenderadresse)
        </label>
        <p className="text-xs text-slate-500">Die E-Mail wird mit Ihrem Firmenlogo im Kopf und Ihren Firmendaten im Fuß gesendet. Das PDF wird automatisch angehängt. Der Versand läuft über Ihr E-Mail-Postfach (Einstellungen → E-Mail-Versand); die Software kann nur bestätigen, dass die Nachricht an Ihren Mailserver übergeben wurde, nicht, dass sie gelesen wurde.</p>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex gap-2 pt-1">
          <button onClick={send} disabled={sending || !to.trim()} className="flex-1 bg-brand hover:bg-brand-dark text-white py-2 rounded-lg text-sm font-medium disabled:opacity-50">{sending ? "Wird gesendet ..." : "E-Mail senden"}</button>
          <button onClick={onClose} className="px-4 py-2 rounded-lg bg-slate-200 dark:bg-slate-700 text-sm">Abbrechen</button>
        </div>
      </div>
    </div>
  );
}
