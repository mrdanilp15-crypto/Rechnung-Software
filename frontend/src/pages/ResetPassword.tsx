import { FormEvent, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api/client";

const inputClass = "w-full mb-4 px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-transparent";

/** Zielseite des Links aus der "Passwort vergessen"-Mail. */
export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== repeat) return setError("Die beiden Passwörter stimmen nicht überein.");
    setLoading(true);
    try {
      await api.post("/auth/reset-password", { token, newPassword: password });
      setDone(true);
    } catch (err: any) {
      setError(err.response?.data?.error || err.response?.data?.details?.[0]?.message || "Zurücksetzen fehlgeschlagen.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900 px-4">
      <form onSubmit={submit} className="w-full max-w-sm bg-white dark:bg-slate-800 p-8 rounded-lg shadow">
        <h1 className="text-xl font-semibold mb-4 text-brand">Neues Passwort vergeben</h1>
        {done ? (
          <p className="text-sm mb-4">Ihr Passwort wurde geändert. Alle anderen Sitzungen wurden abgemeldet. Sie können sich jetzt anmelden.</p>
        ) : !token ? (
          <p className="text-red-600 text-sm mb-4">Dieser Link ist unvollständig. Bitte fordern Sie einen neuen an.</p>
        ) : (
          <>
            {error && <p className="text-red-600 text-sm mb-4">{error}</p>}
            <label className="block text-sm mb-1">Neues Passwort</label>
            <input type="password" autoFocus required minLength={10} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} />
            <label className="block text-sm mb-1">Passwort wiederholen</label>
            <input type="password" required minLength={10} autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} className={inputClass} />
            <p className="text-xs text-slate-500 mb-4">Mindestens 10 Zeichen, mit Buchstaben und Ziffern.</p>
            <button type="submit" disabled={loading} className="w-full bg-brand hover:bg-brand-dark text-white py-2 rounded disabled:opacity-50">
              {loading ? "Wird gespeichert ..." : "Passwort speichern"}
            </button>
          </>
        )}
        <p className="text-sm mt-4 text-center">
          <Link to={done ? "/login" : "/forgot-password"} className="text-brand hover:underline">{done ? "Zur Anmeldung" : "Neuen Link anfordern"}</Link>
        </p>
      </form>
    </div>
  );
}
