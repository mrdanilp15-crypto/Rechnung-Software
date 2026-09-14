import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import { useAuthStore } from "../store/authStore";

export default function Login() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const setSession = useAuthStore((s) => s.setSession);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totpToken, setTotpToken] = useState("");
  const [needsTotp, setNeedsTotp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { data } = await api.post("/auth/login", { email, password, totpToken: totpToken || undefined });
      setSession({ accessToken: data.accessToken, refreshToken: data.refreshToken, user: data.user });
      navigate("/");
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

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
      <form onSubmit={handleSubmit} className="w-full max-w-sm bg-white dark:bg-slate-800 p-8 rounded-lg shadow">
        <h1 className="text-xl font-semibold mb-6 text-brand">{t("auth.login")}</h1>
        {error && <p className="text-red-600 text-sm mb-4">{error}</p>}
        <label className="block text-sm mb-1">{t("auth.email")}</label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full mb-4 px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-transparent"
        />
        <label className="block text-sm mb-1">{t("auth.password")}</label>
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full mb-4 px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-transparent"
        />
        {needsTotp && (
          <>
            <label className="block text-sm mb-1">{t("auth.totpToken")}</label>
            <input
              type="text"
              inputMode="numeric"
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
          {t("auth.noAccount")}{" "}
          <Link to="/register" className="text-brand hover:underline">
            {t("auth.register")}
          </Link>
        </p>
      </form>
    </div>
  );
}
