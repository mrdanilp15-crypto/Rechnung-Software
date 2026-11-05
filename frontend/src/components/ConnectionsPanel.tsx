import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { useToast } from "./Toast";

/** Einstellungen -> Verbindungen: Ampel für E-Mail, Drucker, Adresse (QR-Codes), Push, Backup und Speicherplatz, mit Testknöpfen. */

interface Check {
  id: string;
  label: string;
  state: "ok" | "warn" | "error" | "off";
  detail: string;
  to?: string;
  test?: "smtp-test" | "backup-run";
}

const DOT: Record<Check["state"], string> = { ok: "bg-green-500", warn: "bg-amber-500", error: "bg-red-500", off: "bg-slate-400" };
const WORD: Record<Check["state"], string> = { ok: "in Ordnung", warn: "Hinweis", error: "Problem", off: "nicht eingerichtet" };

export function ConnectionsPanel() {
  const showToast = useToast();
  const [checks, setChecks] = useState<Check[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    api.get("/system/status").then((r) => setChecks(r.data.checks)).catch((e) => setError(e?.response?.data?.error ?? "Status konnte nicht geladen werden."));
  }, []);
  useEffect(load, [load]);

  async function runTest(c: Check) {
    setBusy(c.id);
    try {
      if (c.test === "smtp-test") {
        const { data } = await api.post("/companies/me/smtp/test");
        showToast(`Testmail an ${data.sentTo} gesendet`, "success");
      } else if (c.test === "backup-run") {
        const { data } = await api.post("/backups/run");
        showToast(`Backup erstellt (${data.file})`, "success");
      }
      load();
    } catch (e: any) {
      showToast(e?.response?.data?.error ?? "Der Test ist fehlgeschlagen", "error");
    } finally {
      setBusy(null);
    }
  }

  const problems = (checks ?? []).filter((c) => c.state === "error").length;
  const hints = (checks ?? []).filter((c) => c.state === "warn").length;

  return (
    <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-medium">Verbindungen &amp; Status</h2>
          <p className="text-sm text-slate-500">Hier siehst du an einer Stelle, ob E-Mail, Drucker, QR-Adresse, Push und Backup gerade funktionieren.</p>
        </div>
        <button type="button" onClick={load} className="text-sm text-brand hover:underline shrink-0">Neu prüfen</button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {checks && (
        <p className={`text-sm font-medium ${problems > 0 ? "text-red-600" : hints > 0 ? "text-amber-600" : "text-green-600"}`}>
          {problems > 0 ? `${problems} ${problems === 1 ? "Problem" : "Probleme"} gefunden` : hints > 0 ? `Alles läuft, ${hints} ${hints === 1 ? "Hinweis" : "Hinweise"}` : "Alles in Ordnung"}
        </p>
      )}
      <ul className="divide-y divide-slate-100 dark:divide-slate-700">
        {(checks ?? []).map((c) => (
          <li key={c.id} className="py-3 flex flex-wrap items-start gap-x-3 gap-y-1">
            <span className={`mt-1.5 w-2.5 h-2.5 rounded-full shrink-0 ${DOT[c.state]}`} aria-hidden />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">{c.label} <span className="text-xs font-normal text-slate-500">· {WORD[c.state]}</span></div>
              <div className="text-sm text-slate-500">{c.detail}</div>
            </div>
            <div className="flex items-center gap-3 text-sm shrink-0">
              {c.test && <button type="button" disabled={busy === c.id} onClick={() => runTest(c)} className="text-brand hover:underline disabled:opacity-50">{busy === c.id ? "Läuft ..." : c.test === "backup-run" ? "Jetzt sichern" : "Testen"}</button>}
              {c.to && <Link to={c.to} className="text-brand hover:underline">{c.state === "ok" ? "Öffnen" : c.state === "off" ? "Einrichten" : "Beheben"}</Link>}
            </div>
          </li>
        ))}
        {checks === null && !error && <li className="py-3 text-sm text-slate-500">Wird geprüft ...</li>}
      </ul>
    </div>
  );
}
