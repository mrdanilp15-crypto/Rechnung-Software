import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../store/authStore";
import { useDarkMode } from "../theme/useDarkMode";
import { setLocale } from "../i18n";

const navItems = [
  { to: "/", key: "dashboard" },
  { to: "/customers", key: "customers" },
  { to: "/products", key: "products" },
  { to: "/materials", key: "materials" },
  { to: "/invoices", key: "invoices" },
  { to: "/quotes", key: "quotes" },
  { to: "/delivery-notes", key: "deliveryNotes" },
  { to: "/order-confirmations", key: "orderConfirmations" },
  { to: "/finance", key: "finance" },
  { to: "/settings", key: "settings" },
] as const;

export default function Layout() {
  const { t, i18n } = useTranslation();
  const { user, clearSession } = useAuthStore();
  const { isDark, toggle } = useDarkMode();
  const navigate = useNavigate();

  return (
    <div className="flex min-h-screen">
      <aside className="w-60 shrink-0 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-4 flex flex-col">
        <h1 className="text-lg font-semibold mb-6 text-brand">{t("app.title")}</h1>
        <nav className="flex flex-col gap-1 flex-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                `px-3 py-2 rounded-md text-sm ${
                  isActive
                    ? "bg-brand text-white"
                    : "hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200"
                }`
              }
            >
              {t(`nav.${item.key}`)}
            </NavLink>
          ))}
        </nav>
        <div className="flex flex-col gap-2 pt-4 border-t border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between text-sm">
            <span>{t("settings.darkMode")}</span>
            <button onClick={toggle} className="px-2 py-1 rounded bg-slate-100 dark:bg-slate-800">
              {isDark ? "🌙" : "☀️"}
            </button>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span>{t("settings.language")}</span>
            <select
              value={i18n.language}
              onChange={(e) => setLocale(e.target.value as "de" | "en")}
              className="bg-slate-100 dark:bg-slate-800 rounded px-2 py-1"
            >
              <option value="de">DE</option>
              <option value="en">EN</option>
            </select>
          </div>
          <div className="text-xs text-slate-500 truncate" title={user?.email}>
            {user?.name} ({user?.role})
          </div>
          <button
            onClick={() => {
              clearSession();
              navigate("/login");
            }}
            className="text-sm text-left text-red-600 hover:underline"
          >
            {t("nav.logout")}
          </button>
        </div>
      </aside>
      <main className="flex-1 p-6 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
