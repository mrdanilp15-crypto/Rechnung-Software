import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../store/authStore";
import { useDarkMode } from "../theme/useDarkMode";
import { setLocale } from "../i18n";
import { api } from "../api/client";
import { GlobalSearch } from "./GlobalSearch";
import { NewMenu } from "./NewMenu";
import { RunningTimerChip } from "./RunningTimerChip";
import { topicForPath } from "../lib/helpContent";
import { Avatar } from "./Avatar";
import { Icon, type IconName } from "./Icon";
import { cachedAppearance, setAppearanceFromCompany } from "../theme/appearance";

// Die wichtigsten Bereiche als flache Liste. "tab" hebt einen Reiter der Katalogseite hervor (Produkte, Material, Drucker); "match" bestimmt,
// welche Unterseiten den Menüpunkt hervorheben.
interface NavItem {
  to: string;
  key: string;
  icon: IconName;
  match: readonly string[];
  tab?: string;
}
const navItems: readonly NavItem[] = [
  { to: "/", key: "start", icon: "home", match: [] },
  { to: "/production", key: "production", icon: "board", match: ["/production"] },
  { to: "/documents", key: "documents", icon: "document", match: ["/documents", "/invoices", "/quotes", "/order-confirmations", "/delivery-notes", "/recurring"] },
  { to: "/customers", key: "customers", icon: "users", match: ["/customers"] },
  { to: "/catalog?tab=products", key: "products", icon: "cube", match: ["/products"], tab: "products" },
  { to: "/catalog?tab=materials", key: "materials", icon: "filament", match: ["/materials"], tab: "materials" },
  { to: "/catalog?tab=printers", key: "printers", icon: "printer", match: [], tab: "printers" },
  { to: "/catalog?tab=suppliers", key: "suppliers", icon: "archive", match: [], tab: "suppliers" },
  { to: "/time", key: "time", icon: "clock", match: ["/time"] },
  { to: "/finance", key: "finance", icon: "money", match: ["/finance"] },
  { to: "/stats", key: "stats", icon: "chart", match: ["/stats"] },
  { to: "/archive", key: "archive", icon: "archive", match: ["/archive"] },
  { to: "/settings", key: "settings", icon: "cog", match: ["/settings", "/audit-log"] },
  { to: "/help", key: "help", icon: "help", match: ["/help"] },
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
const ROLE_LABEL: Record<string, string> = { ADMIN: "Administrator", MITARBEITER: "Mitarbeiter", BUCHHALTUNG: "Buchhaltung" };

const initials = (name: string | undefined) =>
  (name ?? "?").split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "?";

/** Programmname (aus den Einstellungen), aktualisiert sich bei Änderung ohne Neuladen. */
function useAppName() {
  const [name, setName] = useState(() => cachedAppearance().appName);
  useEffect(() => {
    const on = (e: Event) => setName((e as CustomEvent).detail?.appName ?? cachedAppearance().appName);
    window.addEventListener("appearance-changed", on);
    return () => window.removeEventListener("appearance-changed", on);
  }, []);
  return name;
}

/** Benutzermenü oben rechts: Name und Rolle, Einstellungen, Sprache, Abmelden. */
function UserMenu({ onLogout }: { onLogout: () => void }) {
  const { user } = useAuthStore();
  const { i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex items-center gap-2 pl-1 pr-2 py-1 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800" aria-haspopup="menu" aria-expanded={open}>
        <Avatar id={user?.id ?? ""} name={user?.name ?? ""} avatar={user?.avatar} size="md" />
        <span className="hidden xl:block text-left leading-tight">
          <span className="block text-sm font-medium">{user?.name}</span>
          <span className="block text-xs text-slate-500">{ROLE_LABEL[user?.role ?? ""] ?? user?.role}</span>
        </span>
        <Icon name="chevronRight" className="w-3.5 h-3.5 text-slate-400 rotate-90" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 mt-2 w-60 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-lg py-1 z-50 text-sm">
          <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700">
            <div className="font-medium truncate">{user?.name}</div>
            <div className="text-xs text-slate-500 truncate">{user?.email}</div>
          </div>
          <button role="menuitem" onClick={() => { setOpen(false); navigate("/settings"); }} className="w-full text-left px-4 py-2 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-2"><Icon name="cog" className="w-4 h-4" />Einstellungen</button>
          <div className="px-4 py-2 flex items-center justify-between">
            <span>Sprache</span>
            <select value={i18n.language} onChange={(e) => setLocale(e.target.value as "de" | "en")} className="bg-slate-100 dark:bg-slate-900 rounded px-2 py-1">
              <option value="de">DE</option>
              <option value="en">EN</option>
            </select>
          </div>
          <button role="menuitem" onClick={onLogout} className="w-full text-left px-4 py-2 hover:bg-slate-50 dark:hover:bg-slate-700 text-red-600 flex items-center gap-2 border-t border-slate-100 dark:border-slate-700"><Icon name="logout" className="w-4 h-4" />Abmelden</button>
        </div>
      )}
    </div>
  );
}

export default function Layout() {
  const { t, i18n } = useTranslation();
  const { user, clearSession } = useAuthStore();
  const { isDark, toggle } = useDarkMode();
  const navigate = useNavigate();
  const location = useLocation();
  const appName = useAppName();
  // Sidebar ist auf dem Handy standardmäßig eingeklappt (Overlay statt fest verankert),
  // ab 1024 px (Tablet quer, Laptop) immer sichtbar - siehe lg:translate-x-0 unten; zwischen 1024 und 1279 px als schmale Symbolleiste.
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [unread, setUnread] = useState(0);

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

  // Design, Akzentfarbe und Programmname der Firma übernehmen (gelten auf allen Geräten)
  useEffect(() => {
    api.get("/companies/me").then((res) => setAppearanceFromCompany(res.data)).catch(() => {});
  }, []);

  // Ungelesene Meldungen für die Glocke (alle 60 Sekunden, solange die Seite sichtbar ist)
  useEffect(() => {
    let alive = true;
    const load = () => api.get("/notifications").then((r) => alive && setUnread(r.data.unread ?? 0)).catch(() => {});
    load();
    const timer = setInterval(() => { if (!document.hidden) load(); }, 60_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [location.pathname]);

  useEffect(() => {
    setMobileNavOpen(false);
    setQuickOpen(false);
  }, [location.pathname, location.search]);
  // Die Editoren haben eigene Aktionsleisten - dort stört der Schnellzugriff-Knopf
  const inEditor = /\/(new|edit)$/.test(location.pathname);

  async function logout() {
    try {
      await api.post("/auth/logout");
    } finally {
      clearSession();
      navigate("/login");
    }
  }

  const params = new URLSearchParams(location.search);
  const catalogTab = location.pathname.startsWith("/catalog") ? params.get("tab") ?? "products" : null;
  const isActive = (item: NavItem) => {
    if (item.tab) return catalogTab === item.tab || item.match.some((m) => location.pathname === m || location.pathname.startsWith(`${m}/`));
    if (item.to === "/") return location.pathname === "/";
    return item.match.some((m) => location.pathname === m || location.pathname.startsWith(`${m}/`));
  };

  const sidebarContent = (
    <>
      <div className={`flex items-center mb-6 ${isRail ? "lg:justify-center" : "gap-3"} justify-between lg:justify-start`}>
        <div className={`flex items-center gap-3 min-w-0 ${isRail ? "lg:justify-center" : ""}`} title={appName}>
          <span className="w-9 h-9 rounded-xl bg-brand text-white flex items-center justify-center font-semibold shrink-0 shadow-sm">{appName.trim()[0]?.toUpperCase() ?? "R"}</span>
          {!isRail && <span className="text-base font-semibold tracking-tight truncate">{appName}</span>}
        </div>
        <button
          onClick={() => setMobileNavOpen(false)}
          className="lg:hidden w-8 h-8 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500"
          aria-label="Menü schließen"
        >
          ✕
        </button>
      </div>
      <nav className="flex flex-col gap-1 flex-1 overflow-y-auto min-h-0">
        {navItems.map((item) => {
          const active = isActive(item);
          const layout = isRail ? "flex-col justify-center gap-0.5 px-0.5 py-2 text-[10px] leading-tight text-center" : "gap-3 px-3 py-2.5 text-sm";
          return (
            <NavLink
              key={item.to}
              to={item.to}
              title={t(`nav.${item.key}`)}
              end={item.to === "/"}
              className={`flex items-center rounded-xl font-medium transition-colors ${layout} ${!inEditor && BOTTOM_BAR_KEYS.includes(item.key) ? "max-lg:hidden" : ""} ${
                active ? "bg-brand text-white shadow-sm" : "hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"
              }`}
              aria-current={active ? "page" : undefined}
            >
              <Icon name={item.icon} className="w-5 h-5 shrink-0" />
              <span className={isRail ? "block max-w-full truncate" : ""}>{t(`nav.${item.key}`)}</span>
            </NavLink>
          );
        })}
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
        {/* Am Handy gibt es keine obere Leiste: Hell/Dunkel, Sprache und Abmelden bleiben hier im Menü */}
        <div className="lg:hidden flex flex-col gap-2">
          <div className="flex items-center text-sm justify-between">
            <span>{t("settings.darkMode")}</span>
            <button onClick={toggle} className="px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700" aria-label={t("settings.darkMode")}>
              <Icon name={isDark ? "moon" : "sun"} className="w-4 h-4" />
            </button>
          </div>
          <div className="flex items-center text-sm justify-between">
            <span>{t("settings.language")}</span>
            <select value={i18n.language} onChange={(e) => setLocale(e.target.value as "de" | "en")} className="bg-slate-100 dark:bg-slate-800 rounded px-2 py-1">
              <option value="de">DE</option>
              <option value="en">EN</option>
            </select>
          </div>
          <div className="text-xs text-slate-500 truncate" title={user?.email}>
            {user?.name} ({user?.role})
          </div>
          <button onClick={logout} className="text-sm text-red-600 hover:underline text-left" aria-label={t("nav.logout")}>
            {t("nav.logout")}
          </button>
        </div>
      </div>
    </>
  );

  return (
    <div className="flex min-h-screen">
      {/* Mobile Kopfleiste mit Hamburger-Button - ab lg verborgen, da dort die Sidebar dauerhaft sichtbar ist. */}
      <div className="lg:hidden fixed top-0 inset-x-0 z-30 flex items-center justify-between px-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950" style={{ height: `calc(3.5rem + ${SAFE_TOP})`, paddingTop: SAFE_TOP }}>
        {inEditor ? (
          <button onClick={() => setMobileNavOpen(true)} className="w-9 h-9 -ml-2 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-xl" aria-label="Menü öffnen">
            ☰
          </button>
        ) : (
          <span className="w-9" />
        )}
        <span className="font-semibold text-brand truncate">{appName}</span>
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

      <div className="flex-1 min-w-0 flex flex-col">
        {/* Obere Leiste (ab lg): Suche, hell/dunkel, Meldungen, Benutzermenü */}
        <header className="hidden lg:flex sticky top-0 z-20 items-center gap-3 px-8 h-16 border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur" style={{ paddingTop: SAFE_TOP }}>
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="flex-1 max-w-xl flex items-center justify-between gap-2 px-4 py-2 rounded-xl text-sm border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-slate-500 hover:border-slate-300 dark:hover:border-slate-600"
            title="Suchen (Strg K)"
          >
            <span className="flex items-center gap-2"><Icon name="search" className="w-4 h-4" />Suche (Aufträge, Kunden, Belege ...)</span>
            <kbd className="text-xs px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-600">Strg K</kbd>
          </button>
          <div className="ml-auto flex items-center gap-1">
            <RunningTimerChip />
            <NewMenu />
            <button onClick={toggle} className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label={t("settings.darkMode")} title={t("settings.darkMode")}>
              <Icon name={isDark ? "sun" : "moon"} className="w-5 h-5" />
            </button>
            <button onClick={() => navigate(`/help#${topicForPath(location.pathname, location.search)}`)} className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 text-base font-semibold" aria-label="Hilfe zu dieser Seite" title="Hilfe zu dieser Seite">
              ?
            </button>
            <button onClick={() => navigate("/#meldungen")} className="relative w-9 h-9 rounded-xl flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label={unread > 0 ? `${unread} neue Meldungen` : "Meldungen"} title="Meldungen">
              <Icon name="bell" className="w-5 h-5" />
              {unread > 0 && <span className="absolute -top-0.5 -right-0.5 min-w-[1.1rem] h-[1.1rem] px-1 rounded-full bg-red-500 text-white text-[10px] font-semibold flex items-center justify-center">{unread > 9 ? "9+" : unread}</span>}
            </button>
            <UserMenu onLogout={logout} />
          </div>
        </header>

        <main className={`flex-1 p-4 sm:p-6 lg:p-8 overflow-auto min-w-0 pt-[calc(5rem+env(safe-area-inset-top,0px))] lg:pt-8 ${inEditor ? "" : "pb-[calc(9rem+env(safe-area-inset-bottom,0px))] sm:pb-[calc(9rem+env(safe-area-inset-bottom,0px))] lg:pb-8"}`}>
          <Outlet />
        </main>
      </div>

      {/* Mobil: feste Leiste unten mit den wichtigsten Bereichen (große Tippflächen), "Mehr" öffnet das ganze Menü */}
      {!inEditor && (
        <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 h-16 grid grid-cols-5 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 pb-[env(safe-area-inset-bottom)]" aria-label="Hauptnavigation">
          {BOTTOM_BAR_KEYS.map((k) => navItems.find((n) => n.key === k)!).map((item) => {
            const active = isActive(item);
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
