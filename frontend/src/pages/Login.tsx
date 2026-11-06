import { FormEvent, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { currentAppName } from "../theme/appearance";
import { api } from "../api/client";
import { useAuthStore } from "../store/authStore";

export default function Login() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const setUser = useAuthStore((s) => s.setUser);
  const status = useAuthStore((s) => s.status);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totpToken, setTotpToken] = useState("");
  const [needsTotp, setNeedsTotp] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { data } = await api.post("/auth/login", { email: email.trim(), password, totpToken: totpToken || undefined });
      setUser(data.user);
      const from = (location.state as { from?: string } | null)?.from;
      navigate(from && from.startsWith("/") && !from.startsWith("//") && from !== "/login" ? from : "/");
    } catch (err: any) {
      if (err.response?.data?.requiresTotp) {
        setNeedsTotp(true);
      } else {
        setError(err.response?.data?.error || t("auth.loginError"));
      }
    } finally {
      setLoading(false);
    }
  }

  // Wer schon angemeldet ist (Lesezeichen, App-Start, Neuladen), braucht kein Anmeldeformular - gleich weiter zur gewünschten Seite
  if (status === "authenticated") {
    const from = (location.state as { from?: string } | null)?.from;
    return <Navigate to={from && from.startsWith("/") && !from.startsWith("//") && from !== "/login" ? from : "/"} replace />;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
      <form onSubmit={handleSubmit} className="w-full max-w-sm bg-white dark:bg-slate-800 p-8 rounded-lg shadow">
        <div className="text-sm font-medium text-slate-500 mb-1">{currentAppName()}</div>
        <h1 className="text-xl font-semibold mb-6 text-brand">{t("auth.login")}</h1>
        {error && <p className="text-red-600 text-sm mb-4">{error}</p>}
        <label className="block text-sm mb-1">{t("auth.email")}</label>
        <input
          type="email"
          name="email"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          autoFocus
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full mb-4 px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-transparent"
        />
        <label className="block text-sm mb-1">{t("auth.password")}</label>
        <div className="relative mb-4">
          <input
            type={showPassword ? "text" : "password"}
            name="password"
            autoComplete="current-password"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-3 py-2 pr-20 rounded border border-slate-300 dark:border-slate-600 bg-transparent"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 px-2 py-1"
            aria-label={showPassword ? "Passwort verbergen" : "Passwort anzeigen"}
          >
            {showPassword ? "Verbergen" : "Anzeigen"}
          </button>
        </div>
        {needsTotp && (
          <>
            <label className="block text-sm mb-1">{t("auth.totpToken")}</label>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={totpToken}
              onChange={(e) => setTotpToken(e.target.value)}
              className="w-full mb-4 px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-transparent"
            />
          </>
        )}
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-brand hover:bg-brand-dark text-white py-2 rounded disabled:opacity-50"
        >
          {t("auth.login")}
        </button>
        <p className="text-sm mt-4 text-center">
          <Link to="/forgot-password" className="text-brand hover:underline">
            Passwort vergessen?
          </Link>
        </p>
        <p className="text-sm mt-2 text-center">
          {t("auth.noAccount")}{" "}
          <Link to="/register" className="text-brand hover:underline">
            {t("auth.register")}
          </Link>
        </p>
      </form>
    </div>
  );
}
