/**
 * Zeiterfassung: reine Rechenfunktionen (Dauer, Monatsgrenzen in deutscher Zeit, Summen). Die Server laufen meist in UTC, die Zeiten
 * und Monate sollen aber nach deutscher Zeit gelten - ein Eintrag um 00:30 Uhr am 1. gehört in den neuen Monat.
 */

export const TZ = "Europe/Berlin";

export const ACTIVITIES: { key: string; label: string }[] = [
  { key: "PRODUKTION", label: "Produktion (Plattenwechsel, Druckbetreuung)" },
  { key: "NACHARBEIT", label: "Nacharbeit (Stützen entfernen, Schleifen, Lackieren)" },
  { key: "VERPACKUNG", label: "Verpackung und Versand" },
  { key: "DESIGN", label: "Konstruktion und Slicen" },
  { key: "KUNDENKONTAKT", label: "Kundenkontakt und Angebote" },
  { key: "VERWALTUNG", label: "Verwaltung und Buchhaltung" },
  { key: "SONSTIGES", label: "Sonstiges" },
];
export const ACTIVITY_KEYS = ACTIVITIES.map((a) => a.key) as [string, ...string[]];
export const activityLabel = (key: string) => ACTIVITIES.find((a) => a.key === key)?.label.split(" (")[0] ?? key;

/** Dauer in ganzen Minuten, mindestens 1 (ein Start/Stopp-Klick soll nicht als 0 verschwinden). */
export function durationMinutes(start: Date, end: Date): number {
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / 60_000));
}

const dtf = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });

function zonedParts(date: Date) {
  const p = Object.fromEntries(dtf.formatToParts(date).map((x) => [x.type, x.value]));
  return { y: Number(p.year), m: Number(p.month), d: Number(p.day), h: Number(p.hour), min: Number(p.minute), s: Number(p.second) };
}

/** Abstand der deutschen Zeit zu UTC in Millisekunden zu diesem Zeitpunkt (Sommer-/Winterzeit). */
function offsetMs(date: Date): number {
  const z = zonedParts(date);
  return Date.UTC(z.y, z.m - 1, z.d, z.h, z.min, z.s) - Math.floor(date.getTime() / 1000) * 1000;
}

/** Mitternacht (deutsche Zeit) des angegebenen Tages als Zeitpunkt. */
export function zonedMidnight(y: number, m: number, d: number): Date {
  const guess = Date.UTC(y, m - 1, d);
  let t = guess - offsetMs(new Date(guess));
  const off2 = offsetMs(new Date(t));
  t = guess - off2;
  return new Date(t);
}

/** Von (einschließlich) bis (ausschließlich) eines Monats "YYYY-MM" in deutscher Zeit; null bei ungültiger Angabe. */
export function monthRange(ym: string): { from: Date; to: Date } | null {
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(ym);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  return { from: zonedMidnight(y, mo, 1), to: mo === 12 ? zonedMidnight(y + 1, 1, 1) : zonedMidnight(y, mo + 1, 1) };
}

/** Kalendertag (deutsche Zeit) als "YYYY-MM-DD". */
export function dayKey(date: Date): string {
  const z = zonedParts(date);
  return `${z.y}-${String(z.m).padStart(2, "0")}-${String(z.d).padStart(2, "0")}`;
}

export function clockTime(date: Date): string {
  const z = zonedParts(date);
  return `${String(z.h).padStart(2, "0")}:${String(z.min).padStart(2, "0")}`;
}

export const formatDe = (date: Date) => {
  const z = zonedParts(date);
  return `${String(z.d).padStart(2, "0")}.${String(z.m).padStart(2, "0")}.${z.y}`;
};

/** Minuten als "h:mm" */
export const hm = (minutes: number) => `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`;

/** Dezimalstunden mit Komma, z.B. 90 Minuten = "1,50" (für Abrechnung und Steuerberater). */
export const decimalHours = (minutes: number) => (Math.round((minutes / 60) * 100) / 100).toFixed(2).replace(".", ",");

export interface EntryLike {
  startedAt: Date;
  minutes: number | null;
  activity: string;
  orderConfirmationId?: string | null;
}

export interface Summary {
  totalMinutes: number;
  days: { day: string; minutes: number }[];
  activities: { activity: string; minutes: number }[];
  orders: { orderId: string; minutes: number }[];
}

/** Summen eines Zeitraums nach Tag, Tätigkeit und Auftrag (laufende Einträge ohne Dauer zählen nicht mit). */
export function summarize(entries: EntryLike[]): Summary {
  const days = new Map<string, number>();
  const acts = new Map<string, number>();
  const orders = new Map<string, number>();
  let total = 0;
  for (const e of entries) {
    const m = e.minutes ?? 0;
    if (m <= 0) continue;
    total += m;
    days.set(dayKey(e.startedAt), (days.get(dayKey(e.startedAt)) ?? 0) + m);
    acts.set(e.activity, (acts.get(e.activity) ?? 0) + m);
    if (e.orderConfirmationId) orders.set(e.orderConfirmationId, (orders.get(e.orderConfirmationId) ?? 0) + m);
  }
  return {
    totalMinutes: total,
    days: [...days.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, minutes]) => ({ day, minutes })),
    activities: [...acts.entries()].sort((a, b) => b[1] - a[1]).map(([activity, minutes]) => ({ activity, minutes })),
    orders: [...orders.entries()].sort((a, b) => b[1] - a[1]).map(([orderId, minutes]) => ({ orderId, minutes })),
  };
}

/** Arbeitskosten in Cent aus Minuten und dem Arbeitsstundensatz (Cent pro Stunde). */
export const laborCents = (minutes: number, rateCentsPerHour: number) => (Math.max(0, minutes) / 60) * Math.max(0, rateCentsPerHour);
