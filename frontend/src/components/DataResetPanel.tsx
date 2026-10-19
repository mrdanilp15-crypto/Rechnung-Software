import { useEffect, useRef, useState } from "react";
import { api } from "../api/client";

interface Counts {
  invoicesTotal: number; invoicesFinal: number; invoicesDraft: number; quotes: number; confirmations: number; deliveryNotes: number;
  customers: number; products: number; materials: number; expenses: number; bank: number; recurring: number; dunnings: number;
}
interface Preview {
  locked: boolean; lockedByServer: boolean; companyName: string; totpEnabled: boolean; waitSeconds: number; confirmPhrase: string; counts: Counts;
}

const input = "px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-sm w-full";

const ACKS = [
  { key: "irreversible", text: "Ich habe verstanden, dass das Löschen UNWIDERRUFLICH ist. Zurückholen geht nur über das automatisch erstellte Backup - und das ist aufwendig." },
  { key: "retention", text: "Ich weiß, dass echte Rechnungen und Buchungsbelege gesetzlich 8 bis 10 Jahre aufbewahrt werden müssen (GoBD, § 147 AO, § 14b UStG) und nicht gelöscht werden dürfen." },
  { key: "noRealInvoices", text: "Es handelt sich ausschließlich um Testdaten. Ich habe keine Rechnung aus dieser Software an einen echten Kunden verschickt, ans Finanzamt oder an den Steuerberater gegeben." },
  { key: "backup", text: "Ich weiß, dass ich selbst für die sichere Aufbewahrung des Backups verantwortlich bin und die Software nach dem Löschen wieder bei Nummer 1 beginnt." },
] as const;

/**
 * "Testdaten zurücksetzen" - bewusst umständlich: Warnung -> Verständnis-Häkchen -> Passwort (+2FA) -> Bedenkzeit ->
 * Firmenname + Bestätigungssatz tippen -> zwei Sicherheitsabfragen. Die wichtigen Prüfungen erzwingt zusätzlich der Server.
 */
export function DataResetPanel() {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [step, setStep] = useState(0);
  const [acks, setAcks] = useState<Record<string, boolean>>({});
  const [keepMasterData, setKeepMasterData] = useState(false);
  const [password, setPassword] = useState("");
  const [totp, setTotp] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(0);
  const [companyName, setCompanyName] = useState("");
  const [phrase, setPhrase] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ backupFile: string } | null>(null);
  const timer = useRef<number | undefined>(undefined);

  function load() {
    api.get("/reset/preview").then((r) => setPreview(r.data)).catch(() => undefined);
  }
  useEffect(load, []);
  useEffect(() => () => window.clearInterval(timer.current), []);

  if (!preview) return null;
  const c = preview.counts;
  const allAcked = ACKS.every((a) => acks[a.key]);

  function cancel() {
    window.clearInterval(timer.current);
    setStep(0); setAcks({}); setPassword(""); setTotp(""); setToken(null); setCompanyName(""); setPhrase(""); setError(null);
  }

  async function start() {
    setBusy(true); setError(null);
    try {
      const { data } = await api.post("/reset/start", { password, totpToken: totp || undefined });
      setToken(data.token);
      setCountdown(data.waitSeconds);
      window.clearInterval(timer.current);
      timer.current = window.setInterval(() => setCountdown((s) => (s > 0 ? s - 1 : 0)), 1000);
      setTotp("");
      setStep(3);
    } catch (err: any) {
      setError(err.response?.data?.error || "Fehlgeschlagen");
    } finally { setBusy(false); }
  }

  async function execute() {
    if (!window.confirm(`LETZTE WARNUNG 1/2\n\nJetzt werden ${c.invoicesTotal} Rechnungen, ${c.quotes} Angebote, ${c.confirmations} Aufträge, ${c.deliveryNotes} Lieferscheine${keepMasterData ? "" : `, ${c.customers} Kunden, ${c.products} Produkte`} und alle Ausgaben gelöscht.\n\nWirklich fortfahren?`)) return;
    if (!window.confirm("LETZTE WARNUNG 2/2\n\nDas kann nicht rückgängig gemacht werden. Sind Sie ABSOLUT sicher?")) return;
    setBusy(true); setError(null);
    try {
      const { data } = await api.post("/reset/execute", {
        token, password, totpToken: totp || undefined, companyName, phrase, keepMasterData,
        acknowledgements: { irreversible: true, retention: true, noRealInvoices: true, backup: true },
      });
      setResult({ backupFile: data.backupFile });
      setStep(4);
    } catch (err: any) {
      setError(err.response?.data?.error || "Fehlgeschlagen - es wurde nichts gelöscht.");
    } finally { setBusy(false); }
  }

  async function lockForever() {
    const pw = window.prompt("Das Zurücksetzen wird DAUERHAFT gesperrt (in der App nicht rückgängig zu machen).\n\nZur Bestätigung Ihr Passwort eingeben:");
    if (!pw) return;
    try {
      await api.post("/reset/lock", { password: pw, totpToken: preview!.totpEnabled ? window.prompt("2FA-Code:") || undefined : undefined });
      load();
    } catch (err: any) {
      window.alert(err.response?.data?.error || "Fehlgeschlagen");
    }
  }

  return (
    <div className="bg-white dark:bg-slate-800 rounded-lg shadow border-2 border-red-300 dark:border-red-900 p-4 space-y-3">
      <h2 className="font-medium text-red-700 dark:text-red-400">Gefahrenbereich: Testdaten zurücksetzen</h2>

      {preview.locked ? (
        <p className="text-sm text-slate-600 dark:text-slate-300">
          🔒 Das Zurücksetzen ist {preview.lockedByServer ? "serverseitig (DISABLE_DATA_RESET)" : "dauerhaft"} gesperrt. So sind Ihre Rechnungen vor versehentlichem Löschen geschützt.
        </p>
      ) : result ? (
        <div className="space-y-2 text-sm">
          <p className="text-green-700 dark:text-green-400 font-medium">✓ Zurückgesetzt. Alle Nummernkreise beginnen wieder bei 1.</p>
          <p>Sicherheits-Backup: <code>{result.backupFile}</code> (unter Backups herunterladbar - bitte aufbewahren).</p>
          <p className="text-amber-700 dark:text-amber-400">Empfehlung: Sperren Sie das Zurücksetzen jetzt, damit es später nicht versehentlich passiert.</p>
          <div className="flex gap-2">
            <button onClick={lockForever} className="px-3 py-1.5 rounded bg-slate-800 text-white text-sm">Zurücksetzen dauerhaft sperren</button>
            <button onClick={() => window.location.reload()} className="px-3 py-1.5 rounded bg-slate-200 dark:bg-slate-700 text-sm">Seite neu laden</button>
          </div>
        </div>
      ) : step === 0 ? (
        <>
          <p className="text-sm">
            Löscht alle Belege, Ausgaben und Bankbuchungen und setzt die Nummernkreise zurück - gedacht für den Moment, <strong>bevor Sie echte Rechnungen schreiben</strong>.
          </p>
          <ul className="text-sm text-slate-600 dark:text-slate-300 list-disc pl-5">
            <li>{c.invoicesTotal} Rechnungen ({c.invoicesFinal} mit Nummer, {c.invoicesDraft} Entwürfe), {c.quotes} Angebote, {c.confirmations} Aufträge, {c.deliveryNotes} Lieferscheine</li>
            <li>{c.expenses} Ausgaben, {c.bank} Bankbuchungen, {c.recurring} wiederkehrende Rechnungen, {c.dunnings} Mahnungen</li>
            <li>{c.customers} Kunden, {c.products} Produkte, {c.materials} Materialien (optional behalten)</li>
          </ul>
          {c.invoicesFinal > 0 && (
            <p className="text-sm rounded bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300 p-2">
              ⚠ Es gibt {c.invoicesFinal} Rechnung(en) mit fester Nummer. Echte Rechnungen dürfen Sie gesetzlich nicht löschen. Fahren Sie nur fort, wenn das wirklich alles Testrechnungen sind.
            </p>
          )}
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={keepMasterData} onChange={(e) => setKeepMasterData(e.target.checked)} className="mt-1" />
            <span>Kunden, Produkte und Material <strong>behalten</strong> (nur Belege, Ausgaben und Bankbuchungen löschen)</span>
          </label>
          <button onClick={() => setStep(1)} className="px-4 py-2 rounded bg-red-100 text-red-700 text-sm">Zurücksetzen vorbereiten ...</button>
          <div>
            <button onClick={lockForever} className="text-xs text-slate-500 underline">Zurücksetzen dauerhaft sperren (empfohlen ab dem echten Start)</button>
          </div>
        </>
      ) : step === 1 ? (
        <>
          <p className="text-sm font-medium">Bitte lesen und jeweils bestätigen:</p>
          {ACKS.map((a) => (
            <label key={a.key} className="flex items-start gap-2 text-sm">
              <input type="checkbox" checked={!!acks[a.key]} onChange={(e) => setAcks({ ...acks, [a.key]: e.target.checked })} className="mt-1" />
              <span>{a.text}</span>
            </label>
          ))}
          <div className="flex gap-2">
            <button onClick={() => setStep(2)} disabled={!allAcked} className="px-4 py-2 rounded bg-red-600 text-white text-sm disabled:opacity-40">Weiter</button>
            <button onClick={cancel} className="px-4 py-2 rounded bg-slate-200 dark:bg-slate-700 text-sm">Abbrechen</button>
          </div>
        </>
      ) : step === 2 ? (
        <>
          <p className="text-sm">Zur Sicherheit: Passwort eingeben{preview.totpEnabled ? " und 2FA-Code" : ""}.</p>
          <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Passwort" className={input} />
          {preview.totpEnabled && <input inputMode="numeric" maxLength={6} value={totp} onChange={(e) => setTotp(e.target.value)} placeholder="2FA-Code" className={input} />}
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <div className="flex gap-2">
            <button onClick={start} disabled={busy || !password} className="px-4 py-2 rounded bg-red-600 text-white text-sm disabled:opacity-40">Weiter</button>
            <button onClick={cancel} className="px-4 py-2 rounded bg-slate-200 dark:bg-slate-700 text-sm">Abbrechen</button>
          </div>
        </>
      ) : step === 3 ? (
        <>
          <p className="text-sm text-red-700 dark:text-red-400 font-medium">Letzter Schritt. Vorher wird automatisch ein Backup erstellt - schlägt es fehl, wird nichts gelöscht.</p>
          <label className="block text-sm">
            Firmenname eintippen: <strong>{preview.companyName}</strong>
            <input value={companyName} onChange={(e) => setCompanyName(e.target.value)} className={`${input} mt-1`} autoComplete="off" />
          </label>
          <label className="block text-sm">
            Zur Bestätigung eintippen: <strong>{preview.confirmPhrase}</strong>
            <input value={phrase} onChange={(e) => setPhrase(e.target.value)} className={`${input} mt-1`} autoComplete="off" />
          </label>
          <label className="block text-sm">
            Passwort noch einmal
            <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className={`${input} mt-1`} />
          </label>
          {preview.totpEnabled && <input inputMode="numeric" maxLength={6} value={totp} onChange={(e) => setTotp(e.target.value)} placeholder="2FA-Code (aktuell)" className={input} />}
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <div className="flex gap-2">
            <button
              onClick={execute}
              disabled={busy || countdown > 0 || companyName.trim() !== preview.companyName.trim() || phrase.trim() !== preview.confirmPhrase || !password}
              className="px-4 py-2 rounded bg-red-600 text-white text-sm disabled:opacity-40"
            >
              {busy ? "Wird gelöscht ..." : countdown > 0 ? `Bedenkzeit: ${countdown} s` : "Endgültig löschen"}
            </button>
            <button onClick={cancel} className="px-4 py-2 rounded bg-slate-200 dark:bg-slate-700 text-sm">Abbrechen</button>
          </div>
        </>
      ) : null}
    </div>
  );
}
