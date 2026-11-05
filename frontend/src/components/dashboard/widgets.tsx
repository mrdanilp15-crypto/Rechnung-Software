import { ReactNode, useMemo } from "react";
import { Link } from "react-router-dom";
import { Icon, type IconName } from "../Icon";
import { formatMinutes, type LiveStatus } from "../PrinterLive";

/** Bausteine der Startseite: Kennzahlen, Druckerübersicht, Aufträge, Umsatz und Gewinn, Materiallager, Schnellaktionen. */

export const eur = (cents: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(cents / 100);
export const eurShort = (cents: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(cents / 100);

const TONES = {
  brand: "bg-brand/15 text-brand",
  green: "bg-green-500/15 text-green-600 dark:text-green-400",
  amber: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  red: "bg-red-500/15 text-red-600 dark:text-red-400",
  violet: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
  slate: "bg-slate-500/15 text-slate-500 dark:text-slate-400",
} as const;
export type Tone = keyof typeof TONES;
const SUB_TONES = { good: "text-green-600 dark:text-green-400", warn: "text-amber-600 dark:text-amber-400", bad: "text-red-600 dark:text-red-400", muted: "text-slate-500" } as const;

/** Karte mit Titel und optionalem Link rechts oben. */
export function Panel({ title, action, className = "", children }: { title?: string; action?: { to: string; label: string }; className?: string; children: ReactNode }) {
  return (
    <section className={`bg-white dark:bg-slate-800 rounded-xl p-4 shadow min-w-0 ${className}`}>
      {title && (
        <div className="flex items-center justify-between gap-2 mb-3">
          <h2 className="text-base font-semibold tracking-tight">{title}</h2>
          {action && <Link to={action.to} className="text-xs text-slate-500 hover:text-brand border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1">{action.label}</Link>}
        </div>
      )}
      {children}
    </section>
  );
}

/** Kennzahl-Kachel: Symbol links, Wert groß, Zusatzzeile farbig. */
export function Kpi({ icon, tone, label, value, sub, subTone = "muted", to }: { icon: IconName; tone: Tone; label: string; value: ReactNode; sub?: ReactNode; subTone?: keyof typeof SUB_TONES; to?: string }) {
  const body = (
    <div className="flex items-center gap-2.5 sm:gap-4">
      <span className={`hidden min-[360px]:flex w-9 h-9 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center shrink-0 ${TONES[tone]}`}>
        <Icon name={icon} className="w-5 h-5 sm:w-6 sm:h-6" />
      </span>
      <div className="min-w-0">
        <p className="text-xs sm:text-sm text-slate-500 truncate">{label}</p>
        <p className="text-xl sm:text-2xl font-semibold tracking-tight truncate">{value}</p>
        {sub && <p className={`text-xs truncate ${SUB_TONES[subTone]}`}>{sub}</p>}
      </div>
    </div>
  );
  const cls = "bg-white dark:bg-slate-800 rounded-xl p-3 sm:p-4 shadow min-w-0 block";
  return to ? <Link to={to} className={`${cls} hover:ring-1 hover:ring-brand/40 transition`}>{body}</Link> : <div className={cls}>{body}</div>;
}

// ---------- Drucker ----------

export interface LivePrinter {
  id: string;
  name: string;
  status: LiveStatus;
}

const errorCodeText = (code: number) => {
  const h = code.toString(16).toUpperCase().padStart(8, "0");
  return `${h.slice(0, 4)}-${h.slice(4)}`;
};

function printerTone(s: LiveStatus): { label: string; dot: string; text: string; kind: "active" | "ready" | "error" | "off" } {
  if (s.connection !== "online") return { label: "Offline", dot: "bg-slate-400", text: "text-slate-500", kind: "off" };
  if (s.errorCode !== null && s.state !== "IDLE") return { label: "Fehler", dot: "bg-red-500", text: "text-red-500", kind: "error" };
  if (s.state === "RUNNING" || s.state === "PREPARE") return { label: s.state === "PREPARE" ? "Vorbereitung" : "Druckt", dot: "bg-brand", text: "text-brand", kind: "active" };
  if (s.state === "PAUSE") return { label: "Pausiert", dot: "bg-amber-500", text: "text-amber-500", kind: "active" };
  if (s.state === "FAILED") return { label: "Fehler", dot: "bg-red-500", text: "text-red-500", kind: "error" };
  if (s.state === "FINISH") return { label: "Fertig", dot: "bg-green-500", text: "text-green-500", kind: "ready" };
  return { label: "Bereit", dot: "bg-green-500", text: "text-green-500", kind: "ready" };
}

export function PrinterOverview({ printers }: { printers: LivePrinter[] }) {
  if (printers.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        Noch kein Drucker mit Live-Verbindung. Unter <Link to="/catalog?tab=printers" className="text-brand hover:underline">Drucker</Link> kannst du einen Bambu-Lab-Drucker im LAN-Modus verbinden, dann siehst du hier Fortschritt, Restzeit und Material.
      </p>
    );
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
      {printers.slice(0, 4).map(({ id, name, status }) => {
        const tone = printerTone(status);
        const pct = status.progressPercent ?? 0;
        return (
          <Link key={id} to="/catalog?tab=printers" className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-900/40 p-3 hover:border-brand/50 transition block min-w-0">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium truncate">{name}</span>
              <span className={`flex items-center gap-1.5 text-xs shrink-0 ${tone.text}`}><span className={`w-2 h-2 rounded-full ${tone.dot}`} />{tone.label}</span>
            </div>
            <div className="my-3 h-20 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
              <Icon name="printer" className={`w-10 h-10 ${tone.kind === "error" ? "text-red-500" : tone.kind === "active" ? "text-brand" : "text-slate-400"}`} />
            </div>
            {tone.kind === "active" && (
              <>
                <div className="flex items-center gap-2">
                  <div className="h-1.5 flex-1 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden"><div className="h-full bg-brand" style={{ width: `${pct}%` }} /></div>
                  <span className="text-xs font-medium">{pct} %</span>
                </div>
                <p className="text-xs mt-1.5 truncate">{status.jobName ?? "Druck"}</p>
                <p className="text-xs text-slate-500">{status.remainingMinutes !== null ? `${formatMinutes(status.remainingMinutes)} verbleibend` : "Restzeit unbekannt"}</p>
              </>
            )}
            {tone.kind === "error" && (
              <>
                <p className="text-xs text-red-500 font-medium">{status.errorCode !== null ? `Druckerfehler ${errorCodeText(status.errorCode)}` : "Druck fehlgeschlagen"}</p>
                <p className="text-xs text-slate-500">Bitte am Drucker nachsehen.</p>
              </>
            )}
            {tone.kind === "ready" && <p className="text-xs text-slate-500">{status.state === "FINISH" ? "Druck fertig - Platte räumen" : "Bereit für neuen Auftrag"}</p>}
            {tone.kind === "off" && <p className="text-xs text-slate-500">{status.message ?? "Nicht verbunden"}</p>}
            {tone.kind === "active" && (
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
                {status.ams.activeLabel && <span>{status.ams.activeLabel}</span>}
                {status.nozzleTemp !== null && <span>Düse {Math.round(status.nozzleTemp)}°</span>}
                {status.bedTemp !== null && <span>Bett {Math.round(status.bedTemp)}°</span>}
              </div>
            )}
          </Link>
        );
      })}
    </div>
  );
}

// ---------- Aufträge ----------

export interface OrderRow {
  id: string;
  number: string;
  customerName: string;
  productionStatus: string;
  expectedDeliveryDate: string | null;
  itemSummary: string[];
  issueDate?: string;
}

const ORDER_CHIP: Record<string, { label: string; cls: string }> = {
  CREATED: { label: "Erstellt", cls: "bg-slate-500/15 text-slate-600 dark:text-slate-300" },
  IN_PRODUCTION: { label: "In Produktion", cls: "bg-brand/15 text-brand" },
  READY_TO_SHIP: { label: "Versandbereit", cls: "bg-green-500/15 text-green-600 dark:text-green-400" },
  SHIPPED: { label: "Versendet", cls: "bg-slate-500/15 text-slate-500" },
};

export function OrdersWidget({ orders }: { orders: OrderRow[] }) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (orders.length === 0) return <p className="text-sm text-slate-500">Keine offenen Aufträge. Neue Aufträge entstehen aus Auftragsbestätigungen (Belege → Neuer Beleg) oder dem Etsy-Import.</p>;
  return (
    <ul className="divide-y divide-slate-100 dark:divide-slate-700">
      {orders.slice(0, 5).map((o) => {
        const chip = ORDER_CHIP[o.productionStatus] ?? ORDER_CHIP.CREATED;
        const due = o.expectedDeliveryDate ? new Date(o.expectedDeliveryDate) : null;
        const overdue = !!due && due < today;
        return (
          <li key={o.id}>
            <Link to="/production" className="flex items-center gap-3 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-700/40 -mx-2 px-2 rounded-lg">
              <span className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-700 flex items-center justify-center shrink-0"><Icon name="cube" className="w-5 h-5 text-slate-400" /></span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium truncate">{o.number} · {o.customerName}</span>
                <span className="block text-xs text-slate-500 truncate">{o.itemSummary[0] ?? "Keine Positionen"}</span>
              </span>
              <span className="shrink-0 text-right">
                <span className={`inline-block text-xs px-2 py-0.5 rounded-full ${chip.cls}`}>{chip.label}</span>
                {due && <span className={`block text-xs mt-0.5 ${overdue ? "text-red-500" : "text-slate-500"}`}>{overdue ? "überfällig " : "bis "}{due.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })}</span>}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

// ---------- Umsatz und Gewinn ----------

export interface DayPoint {
  day: number;
  revenueCents: number;
  expenseCents: number;
}

/** Kumulierter Verlauf des Monats: Umsatz (netto) und Ergebnis (Umsatz minus Ausgaben) als Linien (reines SVG). */
export function MonthChart({ days, today }: { days: DayPoint[]; today: number }) {
  const W = 600, H = 190, PAD_L = 44, PAD_B = 22;
  const data = useMemo(() => {
    let rev = 0, res = 0;
    return days.filter((d) => d.day <= today).map((d) => {
      rev += d.revenueCents;
      res += d.revenueCents - d.expenseCents;
      return { day: d.day, rev, res };
    });
  }, [days, today]);
  const max = Math.max(1, ...data.map((d) => Math.max(d.rev, d.res)));
  const min = Math.min(0, ...data.map((d) => d.res));
  const range = max - min || 1;
  const n = days.length;
  const x = (day: number) => PAD_L + ((day - 1) / Math.max(1, n - 1)) * (W - PAD_L - 8);
  const y = (v: number) => 8 + (1 - (v - min) / range) * (H - 8 - PAD_B);
  const path = (key: "rev" | "res") => data.map((d, i) => `${i === 0 ? "M" : "L"}${x(d.day).toFixed(1)},${y(d[key]).toFixed(1)}`).join(" ");
  const ticks = [0, 0.5, 1].map((f) => min + range * f);
  const labelDays = [1, Math.round(n / 4), Math.round(n / 2), Math.round((3 * n) / 4), n];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Kumulierter Umsatz und Ergebnis dieses Monats">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={PAD_L} x2={W - 8} y1={y(t)} y2={y(t)} className="stroke-slate-200 dark:stroke-slate-700" strokeDasharray="3 4" />
          <text x={PAD_L - 6} y={y(t) + 3} textAnchor="end" className="fill-slate-500" fontSize="10">{eurShort(t)}</text>
        </g>
      ))}
      {labelDays.map((d) => <text key={d} x={x(d)} y={H - 6} textAnchor="middle" className="fill-slate-500" fontSize="10">{d}.</text>)}
      {data.length > 0 && (
        <>
          <path d={path("rev")} fill="none" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" className="stroke-brand" />
          <path d={path("res")} fill="none" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" className="stroke-green-500" />
          <circle cx={x(data[data.length - 1].day)} cy={y(data[data.length - 1].rev)} r="3.5" className="fill-brand" />
          <circle cx={x(data[data.length - 1].day)} cy={y(data[data.length - 1].res)} r="3.5" className="fill-green-500" />
        </>
      )}
    </svg>
  );
}

// ---------- Material ----------

export interface MaterialRow {
  id: string;
  name: string;
  unit: string;
  stockQuantity: number;
  minStock?: number | null;
}

/** Bestand in kg umgerechnet; null bei anderen Einheiten (Stück, Meter ...). */
export function stockKg(m: MaterialRow): number | null {
  const u = m.unit.trim().toLowerCase();
  if (u === "g" || u === "gramm") return m.stockQuantity / 1000;
  if (u === "kg") return m.stockQuantity;
  return null;
}
export const isLow = (m: MaterialRow) => !!m.minStock && m.minStock > 0 && m.stockQuantity <= m.minStock;

const amountText = (m: MaterialRow) => {
  const kg = stockKg(m);
  if (kg !== null) return kg >= 1 ? `${kg.toLocaleString("de-DE", { maximumFractionDigits: 1 })} kg` : `${Math.round(kg * 1000)} g`;
  return `${m.stockQuantity.toLocaleString("de-DE", { maximumFractionDigits: 1 })} ${m.unit}`;
};

export function MaterialWidget({ materials }: { materials: MaterialRow[] }) {
  const rows = useMemo(() => {
    const sorted = [...materials].sort((a, b) => Number(isLow(b)) - Number(isLow(a)) || a.stockQuantity - b.stockQuantity);
    return sorted.slice(0, 5);
  }, [materials]);
  if (materials.length === 0) return <p className="text-sm text-slate-500">Noch kein Material erfasst. Unter <Link to="/catalog?tab=materials" className="text-brand hover:underline">Material</Link> legst du Filament und Zubehör an.</p>;
  // Balken: Bestand im Verhältnis zum größten der gezeigten Bestände bzw. zum doppelten Mindestbestand - alles in kg, damit g und kg vergleichbar sind
  const base = (m: MaterialRow, v: number) => (stockKg({ ...m, stockQuantity: v }) ?? v);
  const ref = Math.max(0.001, ...rows.map((m) => Math.max(base(m, m.stockQuantity), base(m, (m.minStock ?? 0) * 2))));
  return (
    <ul className="space-y-3">
      {rows.map((m) => {
        const low = isLow(m);
        const warn = !low && !!m.minStock && m.stockQuantity <= m.minStock * 1.5;
        const pct = Math.max(2, Math.min(100, (Math.max(0, base(m, m.stockQuantity)) / ref) * 100));
        return (
          <li key={m.id}>
            <div className="flex items-center gap-3">
              <span className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${low ? TONES.red : TONES.slate}`}><Icon name="filament" className="w-5 h-5" /></span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-medium truncate">{m.name}</span>
                  <span className={`text-xs shrink-0 ${low ? "text-red-500 font-medium" : "text-slate-500"}`}>{amountText(m)}{low ? " · knapp" : ""}</span>
                </div>
                <div className="h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden mt-1.5">
                  <div className={`h-full ${low ? "bg-red-500" : warn ? "bg-amber-500" : "bg-green-500"}`} style={{ width: `${pct}%` }} />
                </div>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

// ---------- Schnellaktionen ----------

const ACTIONS: { to: string; label: string; icon: IconName; tone: Tone }[] = [
  { to: "/order-confirmations/new", label: "Neuer Auftrag", icon: "plus", tone: "green" },
  { to: "/invoices/new", label: "Neue Rechnung", icon: "receipt", tone: "amber" },
  { to: "/quotes/new", label: "Neues Angebot", icon: "document", tone: "brand" },
  { to: "/customers", label: "Neuer Kunde", icon: "users", tone: "violet" },
  { to: "/archive", label: "Datei hochladen", icon: "upload", tone: "brand" },
  { to: "/time", label: "Zeit erfassen", icon: "clock", tone: "slate" },
];

export function QuickActions() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-2 gap-2">
      {ACTIONS.map((a) => (
        <Link key={a.label} to={a.to} className="flex items-center gap-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-900/40 px-3 py-2.5 text-sm font-medium hover:border-brand/50 transition">
          <span className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${TONES[a.tone]}`}><Icon name={a.icon} className="w-4 h-4" /></span>
          <span className="truncate">{a.label}</span>
        </Link>
      ))}
    </div>
  );
}
