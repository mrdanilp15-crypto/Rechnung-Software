import { useEffect, useRef, useState } from "react";
import { api } from "../api/client";

import { HelpTip } from "./HelpTip";
/**
 * Auftrag als versendet markieren: Versanddienst und Sendungsnummer erfassen und optional einen Versandbescheid per E-Mail an den Kunden schicken.
 * Der Text kommt aus der Standardvorlage "Versandbescheid" (Einstellungen → Vorlagen) und ist vor dem Senden änderbar. Gesendet wird nur auf Klick.
 * Mit markShipped=false (Auftrag ist schon versendet) wird nur die Mail nachträglich gesendet.
 */

const CARRIERS = [
  { key: "DHL", label: "DHL" },
  { key: "DPD", label: "DPD" },
  { key: "GLS", label: "GLS" },
  { key: "HERMES", label: "Hermes" },
  { key: "DEUTSCHE_POST", label: "Deutsche Post" },
  { key: "ABHOLUNG", label: "Abholung" },
  { key: "SONSTIGE", label: "Sonstiger Versand" },
];

const field = "w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-sm";

export function ShippedDialog({ orderId, number, customerName, markShipped, initialCarrier, initialTracking, onClose, onDone }: {
  orderId: string;
  number: string;
  customerName: string;
  markShipped: boolean;
  initialCarrier: string | null;
  initialTracking: string | null;
  onClose: () => void;
  onDone: (info: { mailSentTo: string | null }) => void;
}) {
  const [carrier, setCarrier] = useState(initialCarrier ?? "");
  const [tracking, setTracking] = useState(initialTracking ?? "");
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [smtp, setSmtp] = useState<boolean | null>(null);
  const [alreadySent, setAlreadySent] = useState<string | null>(null);
  const [sendMail, setSendMail] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const touched = useRef(false); // Text wurde von Hand geändert - nicht mehr überschreiben

  // Entwurf der Mail mit den aktuellen Versandangaben (verzögert, solange getippt wird)
  useEffect(() => {
    const t = setTimeout(() => {
      api
        .get(`/production/${orderId}/shipped-draft`, { params: { carrier: carrier || undefined, tracking: tracking || undefined } })
        .then((r) => {
          setTo((cur) => cur || r.data.to);
          setSmtp(r.data.smtpConfigured);
          setAlreadySent(r.data.alreadySentAt);
          if (!touched.current) {
            setSubject(r.data.subject);
            setMessage(r.data.message);
          }
        })
        .catch(() => undefined);
    }, 350);
    return () => clearTimeout(t);
  }, [orderId, carrier, tracking]);

  const mailPossible = smtp === true && !!to.trim();

  async function submit() {
    setBusy(true);
    setError(null);
    let mailSentTo: string | null = null;
    try {
      if (markShipped) {
        await api.patch(`/production/${orderId}`, { productionStatus: "SHIPPED", carrier: carrier || null, trackingNumber: tracking.trim() || null });
      } else {
        await api.patch(`/production/${orderId}`, { carrier: carrier || null, trackingNumber: tracking.trim() || null });
      }
      if (sendMail && mailPossible) {
        try {
          const { data } = await api.post(`/production/${orderId}/shipped-mail`, { to: to.trim(), subject: subject.trim(), message: message.trim() });
          mailSentTo = data.sentTo;
        } catch (e: any) {
          // Der Auftrag ist schon als versendet markiert; der Dialog bleibt offen, ein weiterer Klick versucht nur die Mail erneut
          setError(`${markShipped ? "Der Auftrag ist als versendet markiert, aber " : ""}die E-Mail ging nicht raus: ${e?.response?.data?.error ?? "unbekannter Fehler"}. Du kannst es erneut versuchen oder den Dialog schließen.`);
          setBusy(false);
          return;
        }
      }
      onDone({ mailSentTo });
    } catch (e: any) {
      setError(e?.response?.data?.error ?? "Das hat nicht geklappt.");
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[55] bg-black/50 flex items-center justify-center p-4" role="dialog" aria-label="Versand">
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl w-full max-w-lg max-h-[92vh] flex flex-col">
        <div className="flex items-center px-4 py-3 border-b border-slate-200 dark:border-slate-700">
          <h2 className="font-semibold flex-1">{markShipped ? "Als versendet markieren" : "Versandmail senden"} · {number}<HelpTip topic="production" className="ml-2" /></h2>
          <button onClick={onClose} className="px-3 py-1.5 rounded-lg text-sm bg-slate-100 dark:bg-slate-800" aria-label="Schließen">✕</button>
        </div>
        <div className="p-4 overflow-y-auto space-y-3 text-sm">
          <p className="text-xs text-slate-500">{customerName}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block">Versanddienst
              <select value={carrier} onChange={(e) => setCarrier(e.target.value)} className={`${field} mt-1`}>
                <option value="">- keiner / nicht angeben -</option>
                {CARRIERS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
              </select>
            </label>
            <label className="block">Sendungsnummer
              <input value={tracking} onChange={(e) => setTracking(e.target.value)} placeholder="optional" className={`${field} mt-1`} />
            </label>
          </div>

          <label className="flex items-start gap-2">
            <input type="checkbox" className="mt-0.5" checked={sendMail && mailPossible} disabled={!mailPossible} onChange={(e) => setSendMail(e.target.checked)} />
            <span>
              Versandbescheid per E-Mail an den Kunden senden
              {smtp === false && <span className="block text-xs text-amber-700 dark:text-amber-400">Kein E-Mail-Versand eingerichtet (Einstellungen → E-Mail-Versand).</span>}
              {smtp === true && !to.trim() && <span className="block text-xs text-amber-700 dark:text-amber-400">Beim Kunden ist keine E-Mail-Adresse hinterlegt - unten eintragen.</span>}
              {alreadySent && <span className="block text-xs text-slate-500">Schon gesendet am {new Date(alreadySent).toLocaleDateString("de-DE")}.</span>}
            </span>
          </label>

          {smtp !== false && (
            <div className={`space-y-2 ${sendMail ? "" : "opacity-50"}`}>
              <label className="block">Empfänger
                <input type="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="E-Mail-Adresse des Kunden" className={`${field} mt-1`} />
              </label>
              <label className="block">Betreff
                <input value={subject} onChange={(e) => { touched.current = true; setSubject(e.target.value); }} className={`${field} mt-1`} />
              </label>
              <label className="block">Nachricht
                <textarea value={message} onChange={(e) => { touched.current = true; setMessage(e.target.value); }} rows={9} className={`${field} mt-1`} />
              </label>
              <p className="text-xs text-slate-500">Der Text stammt aus der Vorlage "Versandbescheid" (Einstellungen → Vorlagen). Die Sendungsverfolgung führt zur Seite des Versanddienstes - der Link wird nicht automatisch geprüft.</p>
            </div>
          )}
          {error && <p className="text-red-600">{error}</p>}
        </div>
        <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-700 flex flex-wrap gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm bg-slate-200 dark:bg-slate-700">Abbrechen</button>
          <button onClick={submit} disabled={busy || (!markShipped && !(sendMail && mailPossible))} className="px-4 py-2 rounded-lg text-sm bg-brand text-white disabled:opacity-50">
            {busy ? "Bitte warten ..." : markShipped ? (sendMail && mailPossible ? "Versendet markieren und Mail senden" : "Versendet markieren") : "Mail senden"}
          </button>
        </div>
      </div>
    </div>
  );
}
