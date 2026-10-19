import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";

const inputClass = "w-full mb-4 px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-transparent";

/** Fordert per E-Mail einen Link zum Zurücksetzen des Passworts an. */
export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api.post("/auth/forgot-password", { email });
      setSent(true);
    } catch (err: any) {
      setError(err.response?.data?.error || "Anfrage fehlgeschlagen.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900 px-4">
      <form onSubmit={submit} className="w-full max-w-sm bg-white dark:bg-slate-800 p-8 rounded-lg shadow">
        <h1 className="text-xl font-semibold mb-4 text-brand">Passwort vergessen</h1>
        {sent ? (
          <>
            <p className="text-sm mb-4">
              Falls ein Konto mit dieser Adresse existiert und der E-Mail-Versand unter Einstellungen eingerichtet ist, wurde ein Link zum Zurücksetzen gesendet (eine Stunde gültig). Bitte auch den Spam-Ordner prüfen.
            </p>
            <p className="text-xs text-slate-500 mb-4">
              Kommt nichts an? Ohne eingerichteten E-Mail-Versand kann ein Administrator unter "Benutzer" ein neues Passwort setzen, oder Sie nutzen den Notfall-Befehl auf dem Server (siehe INSTALL.md).
            </p>
          </>
        ) : (
          <>
            <p className="text-sm text-slate-500 mb-4">Geben Sie Ihre E-Mail-Adresse ein. Wir senden Ihnen einen Link, mit dem Sie ein neues Passwort vergeben können.</p>
            {error && <p className="text-red-600 text-sm mb-4">{error}</p>}
            <label className="block text-sm mb-1">E-Mail</label>
            <input type="email" autoFocus required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
            <button type="submit" disabled={loading} className="w-full bg-brand hover:bg-brand-dark text-white py-2 rounded disabled:opacity-50">
              {loading ? "Wird gesendet ..." : "Link anfordern"}
            </button>
          </>
        )}
        <p className="text-sm mt-4 text-center">
          <Link to="/login" className="text-brand hover:underline">Zurück zur Anmeldung</Link>
        </p>
      </form>
    </div>
  );
}
