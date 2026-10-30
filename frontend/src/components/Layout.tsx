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

/** Schaltet bei Änderung der Fenstergröße (Drehen des Tablets) sofort um. */
function useMedia(query: string) {
  const [matches, setMatches] = useState(() => typeof window !== "undefined" && window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}

const SIDEBAR_KEY = "rechnung_sidebar_mode";
const BOTTOM_BAR_KEYS = ["start", "documents", "production", "customers"];
// Oberer Rand: Bei als App installierter Seite (iPad/iPhone) liegt die Statusleiste (Uhrzeit, Akku) über der Seite - env() schiebt alles darunter.
const SAFE_TOP = "env(safe-area-inset-top, 0px)";

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

  // Seitenleiste ab 1024 px: je nach Breite automatisch schmal (nur Symbole) oder voll - mit dem Knopf unten jederzeit umschaltbar (wird gemerkt)
  const lgUp = useMedia("(min-width: 1024px)");
  const xlUp = useMedia("(min-width: 1280px)");
  const [sidebarMode, setSidebarMode] = useState<"expanded" | "collapsed" | null>(() => {
    try {
      const v = localStorage.getItem(SIDEBAR_KEY);
      return v === "expanded" || v === "collapsed" ? v : null;
    } catch {
      return null;
    }
  });
  const isRail = lgUp && (sidebarMode ? sidebarMode === "collapsed" : !xlUp);
  function toggleSidebar() {
    const next = isRail ? "expanded" : "collapsed";
    setSidebarMode(next);
    try {
      localStorage.setItem(SIDEBAR_KEY, next);
    } catch {
      // Speicher gesperrt - gilt dann nur bis zum Neuladen
    }
  }

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
      <div className={`flex items-center justify-between mb-6 ${isRail ? "justify-center" : ""} lg:block`}>
        <h1 className={`text-lg font-semibold text-brand tracking-tight ${isRail ? "text-center" : ""}`}>
          {isRail ? <span title={t("app.title")}>R</span> : t("app.title")}
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
        className={`mb-3 w-full flex items-center px-3 py-2 rounded-lg text-sm border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 ${isRail ? "justify-center px-0" : "justify-between"}`}
      >
        <span className="flex items-center gap-2"><Icon name="search" className="w-4 h-4" />{!isRail && "Suchen ..."}</span>
        {!isRail && <span className="text-xs hidden xl:inline">Strg K</span>}
      </button>
      <nav className="flex flex-col gap-1 flex-1 overflow-y-auto min-h-0">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            title={t(`nav.${item.key}`)}
            end={item.to === "/"}
            className={({ isActive }) => {
              const active = isActive || item.match.some((m) => location.pathname === m || location.pathname.startsWith(`${m}/`));
              const layout = isRail ? "flex-col justify-center gap-0.5 px-0.5 py-2 text-[10px] leading-tight text-center" : "gap-3 px-3 py-2.5 text-sm";
              return `flex items-center rounded-lg font-medium transition-colors ${layout} ${!inEditor && BOTTOM_BAR_KEYS.includes(item.key) ? "max-lg:hidden" : ""} ${
                active
                  ? "bg-brand text-white shadow-sm"
                  : "hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200"
              }`;
            }}
          >
            <Icon name={item.icon} className="w-5 h-5 shrink-0" />
            <span className={isRail ? "block max-w-full truncate" : ""}>{t(`nav.${item.key}`)}</span>
          </NavLink>
        ))}
      </nav>
      <div className="flex flex-col gap-2 pt-4 border-t border-slate-200 dark:border-slate-800">
        <button
          type="button"
          onClick={toggleSidebar}
          className={`hidden lg:flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 ${isRail ? "justify-center" : ""}`}
          title={isRail ? "Menü ausklappen (Beschriftungen anzeigen)" : "Menü einklappen"}
          aria-label={isRail ? "Menü ausklappen" : "Menü einklappen"}
        >
          <Icon name={isRail ? "chevronRight" : "chevronLeft"} className="w-5 h-5" />
          {!isRail && "Menü einklappen"}
        </button>
        <div className={`flex items-center text-sm ${isRail ? "justify-center" : "justify-between"}`}>
          {!isRail && <span>{t("settings.darkMode")}</span>}
          <button onClick={toggle} className="px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700" aria-label={t("settings.darkMode")} title={t("settings.darkMode")}>
            <Icon name={isDark ? "moon" : "sun"} className="w-4 h-4" />
          </button>
        </div>
        <div className={`flex items-center text-sm ${isRail ? "justify-center" : "justify-between"}`}>
          {!isRail && <span>{t("settings.language")}</span>}
          <select
            value={i18n.language}
            onChange={(e) => setLocale(e.target.value as "de" | "en")}
            className="bg-slate-100 dark:bg-slate-800 rounded px-2 py-1"
          >
            <option value="de">DE</option>
            <option value="en">EN</option>
          </select>
        </div>
        {!isRail && (
          <div className="text-xs text-slate-500 truncate" title={user?.email}>
            {user?.name} ({user?.role})
          </div>
        )}
        <button
          onClick={async () => {
            try {
              await api.post("/auth/logout");
            } finally {
              clearSession();
              navigate("/login");
            }
          }}
          className={`text-sm text-red-600 hover:underline ${isRail ? "flex justify-center" : "text-left"}`}
          title={t("nav.logout")}
          aria-label={t("nav.logout")}
        >
          {isRail ? <Icon name="logout" className="w-5 h-5" /> : t("nav.logout")}
        </button>
      </div>
    </>
  );

  return (
    <div className="flex min-h-screen">
      {/* Mobile Kopfleiste mit Hamburger-Button - ab md verborgen, da dort die Sidebar
          dauerhaft sichtbar ist. */}
      <div className="lg:hidden fixed top-0 inset-x-0 z-30 flex items-center justify-between px-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950" style={{ height: `calc(3.5rem + ${SAFE_TOP})`, paddingTop: SAFE_TOP }}>
        {inEditor ? (
          <button onClick={() => setMobileNavOpen(true)} className="w-9 h-9 -ml-2 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-xl" aria-label="Menü öffnen">
            ☰
          </button>
        ) : (
          <span className="w-9" />
        )}
        <span className="font-semibold text-brand">{t("app.title")}</span>
        <button onClick={() => setSearchOpen(true)} className="w-9 h-9 -mr-2 rounded flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300" aria-label="Suchen">
          <Icon name="search" className="w-5 h-5" />
        </button>
      </div>

      {mobileNavOpen && (
        <div className="lg:hidden fixed inset-0 bg-black/40 z-30" onClick={() => setMobileNavOpen(false)} />
      )}

      <aside
        className={`w-64 ${isRail ? "lg:w-[5.75rem] lg:px-1.5" : "lg:w-64"} shrink-0 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-4 flex flex-col
          fixed inset-y-0 left-0 z-40 transform transition-transform duration-200
          ${mobileNavOpen ? "translate-x-0" : "-translate-x-full"}
          lg:sticky lg:top-0 lg:h-screen lg:self-start lg:translate-x-0 lg:z-auto`}
        style={{ paddingTop: `calc(1rem + ${SAFE_TOP})` }}
      >
        {sidebarContent}
      </aside>

      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />

      <main className={`flex-1 p-4 sm:p-6 lg:p-8 overflow-auto min-w-0 pt-[calc(5rem+env(safe-area-inset-top,0px))] lg:pt-[calc(2rem+env(safe-area-inset-top,0px))] ${inEditor ? "" : "pb-24 lg:pb-8"}`}>
        <Outlet />
      </main>

      {/* Mobil: feste Leiste unten mit den wichtigsten Bereichen (große Tippflächen), "Mehr" öffnet das ganze Menü */}
      {!inEditor && (
        <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 h-16 grid grid-cols-5 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 pb-[env(safe-area-inset-bottom)]" aria-label="Hauptmenü">
          {BOTTOM_BAR_KEYS.map((k) => navItems.find((n) => n.key === k)!).map((item) => {
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
