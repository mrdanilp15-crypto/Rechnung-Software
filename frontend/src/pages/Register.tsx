import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import { useAuthStore } from "../store/authStore";

export default function Register() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const setUser = useAuthStore((s) => s.setUser);
  const [form, setForm] = useState({ companyName: "", name: "", email: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { data } = await api.post("/auth/register", form);
      setUser(data.user);
      navigate("/");
    } catch (err: any) {
      setError(err.response?.data?.error || t("common.error"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
      <form onSubmit={handleSubmit} className="w-full max-w-sm bg-white dark:bg-slate-800 p-8 rounded-lg shadow">
        <h1 className="text-xl font-semibold mb-6 text-brand">{t("auth.register")}</h1>
        {error && <p className="text-red-600 text-sm mb-4">{error}</p>}
        {(
          [
            ["companyName", "auth.companyName", "text"],
            ["name", "auth.name", "text"],
            ["email", "auth.email", "email"],
            ["password", "auth.password", "password"],
          ] as const
        ).map(([field, labelKey, type]) => (
          <div key={field} className="mb-4">
            <label className="block text-sm mb-1">{t(labelKey)}</label>
            <input
              type={type}
              required
              minLength={type === "password" ? 10 : undefined}
              value={(form as any)[field]}
              onChange={(e) => setForm((f) => ({ ...f, [field]: e.target.value }))}
              className="w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-transparent"
            />
          </div>
        ))}
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-brand hover:bg-brand-dark text-white py-2 rounded disabled:opacity-50"
        >
          {t("auth.register")}
        </button>
        <p className="text-sm mt-4 text-center">
          {t("auth.haveAccount")}{" "}
          <Link to="/login" className="text-brand hover:underline">
            {t("auth.login")}
          </Link>
        </p>
      </form>
    </div>
  );
}
