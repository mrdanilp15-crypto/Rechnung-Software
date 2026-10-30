import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../store/authStore";
import { useDarkMode } from "../theme/useDarkMode";
import { setLocale } from "../i18n";
import { api } from "../api/client";
import { GlobalSearch } from "./GlobalSearch";
import { Icon, type IconName } from "./Icon";
import { setAppearanceFromCompany } from "../theme/appearance";

// Sieben Hauptpunkte statt zwölf: alle Belegarten stehen unter "Belege", Produkte und Material unter "Katalog".
// "match" bestimmt, welche Unterseiten den Menüpunkt hervorheben.
const navItems: readonly { to: string; key: string; icon: IconName; match: readonly string[] }[] = [
  { to: "/", key: "start", icon: "home", match: [] },
  { to: "/documents", key: "documents", icon: "document", match: ["/documents", "/invoices", "/quotes", "/order-confirmations", "/delivery-notes", "/recurring"] },
  { to: "/production", key: "production", icon: "board", match: ["/production"] },
  { to: "/customers", key: "customers", icon: "users", match: ["/customers"] },
  { to: "/catalog", key: "catalog", icon: "cube", match: ["/catalog", "/products", "/materials"] },
  { to: "/finance", key: "finance", icon: "chart", match: ["/finance"] },
  { to: "/archive", key: "archive", icon: "archive", match: ["/archive"] },
  { to: "/settings", key: "settings", icon: "cog", match: ["/settings", "/audit-log"] },
];

export default function Layout() {
  const { t, i18n } = useTranslation();
  const { user, clearSession } = useAuthStore();
  const { isDark, toggle } = useDarkMode();
  const navigate = useNavigate();
  const location = useLocation();
  // Sidebar ist auf dem Handy standardmäßig eingeklappt (Overlay statt fest verankert),
  // ab 1024 px (Tablet quer, Laptop) immer sichtbar - siehe lg:translate-x-0 unten; zwischen 1024 und 1279 px als schmale Symbolleiste.
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  // Strg+K / Cmd+K öffnet die globale Suche von jeder Seite aus
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Akzentfarbe und Dunkel-Stil der Firma übernehmen (gelten auf allen Geräten)
  useEffect(() => {
    api.get("/companies/me").then((res) => setAppearanceFromCompany(res.data)).catch(() => {});
  }, []);

  useEffect(() => {
    setMobileNavOpen(false);
    setQuickOpen(false);
  }, [location.pathname]);
  // Die Editoren haben eigene Aktionsleisten - dort stört der Schnellzugriff-Knopf
  const inEditor = /\/(new|edit)$/.test(location.pathname);

  const sidebarContent = (
    <>
      <div className="flex items-center justify-between mb-6 lg:block">
        <h1 className="text-lg font-semibold text-brand tracking-tight lg:max-xl:text-center">
          <span className="lg:max-xl:hidden">{t("app.title")}</span>
          <span className="hidden lg:max-xl:inline" title={t("app.title")}>R</span>
        </h1>
        <button
          onClick={() => setMobileNavOpen(false)}
          className="lg:hidden w-8 h-8 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500"
          aria-label="Menü schließen"
        >
          ✕
        </button>
      </div>
      <button
        type="button"
        onClick={() => setSearchOpen(true)}
        title="Suchen (Strg K)"
        className="mb-3 w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 lg:max-xl:justify-center lg:max-xl:px-0"
      >
        <span className="flex items-center gap-2"><Icon name="search" className="w-4 h-4" /><span className="lg:max-xl:hidden">Suchen ...</span></span>
        <span className="text-xs hidden xl:inline">Strg K</span>
      </button>
      <nav className="flex flex-col gap-1 flex-1">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            title={t(`nav.${item.key}`)}
            end={item.to === "/"}
            className={({ isActive }) => {
              const active = isActive || item.match.some((m) => location.pathname === m || location.pathname.startsWith(`${m}/`));
              return `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors lg:max-xl:justify-center lg:max-xl:px-0 ${
                active
                  ? "bg-brand text-white shadow-sm"
                  : "hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200"
              }`;
            }}
          >
            <Icon name={item.icon} className="w-5 h-5 shrink-0" />
            <span className="lg:max-xl:hidden">{t(`nav.${item.key}`)}</span>
          </NavLink>
        ))}
      </nav>
      <div className="flex flex-col gap-2 pt-4 border-t border-slate-200 dark:border-slate-800">
        <div className="flex items-center justify-between text-sm lg:max-xl:justify-center">
          <span className="lg:max-xl:hidden">{t("settings.darkMode")}</span>
          <button onClick={toggle} className="px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700" aria-label={t("settings.darkMode")} title={t("settings.darkMode")}>
            <Icon name={isDark ? "moon" : "sun"} className="w-4 h-4" />
          </button>
        </div>
        <div className="flex items-center justify-between text-sm lg:max-xl:justify-center">
          <span className="lg:max-xl:hidden">{t("settings.language")}</span>
          <select
            value={i18n.language}
            onChange={(e) => setLocale(e.target.value as "de" | "en")}
            className="bg-slate-100 dark:bg-slate-800 rounded px-2 py-1"
          >
            <option value="de">DE</option>
            <option value="en">EN</option>
          </select>
        </div>
        <div className="text-xs text-slate-500 truncate lg:max-xl:hidden" title={user?.email}>
          {user?.name} ({user?.role})
        </div>
        <button
          onClick={async () => {
            try {
              await api.post("/auth/logout");
            } finally {
              clearSession();
              navigate("/login");
            }
          }}
          className="text-sm text-left text-red-600 hover:underline lg:max-xl:flex lg:max-xl:justify-center"
          title={t("nav.logout")}
          aria-label={t("nav.logout")}
        >
          <Icon name="logout" className="w-5 h-5 hidden lg:max-xl:block" />
          <span className="lg:max-xl:hidden">{t("nav.logout")}</span>
        </button>
      </div>
    </>
  );

  return (
    <div className="flex min-h-screen">
      {/* Mobile Kopfleiste mit Hamburger-Button - ab md verborgen, da dort die Sidebar
          dauerhaft sichtbar ist. */}
      <div className="lg:hidden fixed top-0 inset-x-0 z-30 h-14 flex items-center justify-between px-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950">
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
        <div className="lg:hidden fixed inset-0 bg-black/40 z-30" onClick={() => setMobileNavOpen(false)} />
      )}

      <aside
        className={`w-64 lg:w-[72px] xl:w-64 shrink-0 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-4 lg:p-3 xl:p-4 flex flex-col
          fixed inset-y-0 left-0 z-40 transform transition-transform duration-200
          ${mobileNavOpen ? "translate-x-0" : "-translate-x-full"}
          lg:relative lg:translate-x-0 lg:z-auto`}
      >
        {sidebarContent}
      </aside>

      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />

      <main className={`flex-1 p-4 pt-20 sm:p-6 sm:pt-20 lg:p-8 lg:pt-8 overflow-auto min-w-0 ${inEditor ? "" : "pb-24 lg:pb-8"}`}>
        <Outlet />
      </main>

      {/* Mobil: feste Leiste unten mit den wichtigsten Bereichen (große Tippflächen), "Mehr" öffnet das ganze Menü */}
      {!inEditor && (
        <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 h-16 grid grid-cols-5 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 pb-[env(safe-area-inset-bottom)]" aria-label="Hauptmenü">
          {["start", "documents", "production", "customers"].map((k) => navItems.find((n) => n.key === k)!).map((item) => {
            const active = item.to === "/" ? location.pathname === "/" : [item.to, ...item.match].some((m) => location.pathname === m || location.pathname.startsWith(`${m}/`));
            return (
              <NavLink key={item.to} to={item.to} className={`flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${active ? "text-brand" : "text-slate-500"}`}>
                <Icon name={item.icon} className="w-6 h-6" />
                {t(`nav.${item.key}`)}
              </NavLink>
            );
          })}
          <button type="button" onClick={() => setMobileNavOpen(true)} className="flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-slate-500">
            <Icon name="more" className="w-6 h-6" />
            Mehr
          </button>
        </nav>
      )}

      {/* Mobil: "+"-Knopf für die häufigsten Aktionen */}
      {!inEditor && (
        <div className="lg:hidden fixed bottom-20 right-4 z-20">
          {quickOpen && (
            <div className="absolute bottom-14 right-0 w-52 bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 py-1 text-sm">
              <button onClick={() => navigate("/invoices/new")} className="block w-full text-left px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-700">Neue Rechnung</button>
              <button onClick={() => navigate("/quotes/new")} className="block w-full text-left px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-700">Neues Angebot</button>
              <button onClick={() => navigate("/customers")} className="block w-full text-left px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-700">Neuer Kunde</button>
            </div>
          )}
          <button
            onClick={() => setQuickOpen((v) => !v)}
            className="w-12 h-12 rounded-full bg-brand text-white text-2xl shadow-lg flex items-center justify-center"
            aria-label="Neu anlegen"
          >
            {quickOpen ? "×" : "+"}
          </button>
        </div>
      )}
    </div>
  );
}
