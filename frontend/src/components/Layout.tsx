import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
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
  const location = useLocation();
  // Sidebar ist auf dem Handy standardmäßig eingeklappt (Overlay statt fest verankert),
  // auf Desktop-Breiten (md+) immer sichtbar - siehe md:translate-x-0 unten.
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => setMobileNavOpen(false), [location.pathname]);

  const sidebarContent = (
    <>
      <div className="flex items-center justify-between mb-6 md:block">
        <h1 className="text-lg font-semibold text-brand">{t("app.title")}</h1>
        <button
          onClick={() => setMobileNavOpen(false)}
          className="md:hidden w-8 h-8 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500"
          aria-label="Menü schließen"
        >
          ✕
        </button>
      </div>
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
    </>
  );

  return (
    <div className="flex min-h-screen">
      {/* Mobile Kopfleiste mit Hamburger-Button - ab md verborgen, da dort die Sidebar
          dauerhaft sichtbar ist. */}
      <div className="md:hidden fixed top-0 inset-x-0 z-30 h-14 flex items-center justify-between px-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950">
        <button
          onClick={() => setMobileNavOpen(true)}
          className="w-9 h-9 -ml-2 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-xl"
          aria-label="Menü öffnen"
        >
          ☰
        </button>
        <span className="font-semibold text-brand">{t("app.title")}</span>
        <span className="w-9" />
      </div>

      {mobileNavOpen && (
        <div className="md:hidden fixed inset-0 bg-black/40 z-30" onClick={() => setMobileNavOpen(false)} />
      )}

      <aside
        className={`w-64 shrink-0 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-4 flex flex-col
          fixed inset-y-0 left-0 z-40 transform transition-transform duration-200
          ${mobileNavOpen ? "translate-x-0" : "-translate-x-full"}
          md:relative md:translate-x-0 md:z-auto`}
      >
        {sidebarContent}
      </aside>

      <main className="flex-1 p-4 pt-20 md:p-6 md:pt-6 overflow-auto min-w-0">
        <Outlet />
      </main>
    </div>
  );
}
