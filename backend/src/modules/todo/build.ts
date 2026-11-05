import { nameKey } from "../printers/jobUsage";

/**
 * "Heute zu tun": fasst alles zusammen, was Aufmerksamkeit braucht, in einer Liste. Reine Logik ohne Datenbankzugriff (testbar);
 * die Daten holt router.ts. Die Liste verändert nichts von selbst: Vorschläge tragen eine Aktion, die erst auf Klick ausgeführt wird.
 */

export type Severity = "high" | "normal" | "info";

export interface TodoAction {
  label: string;
  method: "PATCH" | "POST";
  url: string;
  body?: Record<string, unknown>;
}

export interface TodoItem {
  id: string;
  kind: string;
  severity: Severity;
  title: string;
  detail?: string;
  link: string;
  /** Vorschlag mit einem Klick bestätigen (sonst führt nur der Link zur Stelle) */
  action?: TodoAction;
}

export interface TodoOrder {
  id: string;
  number: string;
  customer: string;
  productionStatus: string;
  expectedDeliveryDate: Date | null;
  shippedAt: Date | null;
  hasInvoice: boolean;
  /** Positionstexte (erste Zeile), zum Zuordnen von Drucken */
  itemNames: string[];
  runningJobs: number;
  finishedJobs: number;
}

export interface TodoInput {
  now: Date;
  overdueInvoices: { id: string; number: string | null; customer: string; totalCents: number; dueDate: Date | null }[];
  /** Versendete oder abgelaufene Angebote */
  openQuotes: { id: string; number: string; customer: string; issueDate: Date; emailSentAt: Date | null; validUntil: Date | null; hasFollowUp: boolean }[];
  /** Aufträge (nicht ungültig, fertiggestellt) */
  orders: TodoOrder[];
  oldDrafts: number;
  lowStock: string[];
  maintenanceDue: string[];
  /** Fertigteile mit Lagerführung, deren Bestand den Mindestbestand erreicht oder unterschritten hat */
  /** Zahlungseingänge im Bankimport ohne Rechnung (nicht ausgeblendet) */
  unmatchedPayments: number;
  lowProducts: { id: string; name: string; stock: number; min: number; unit: string }[];
  /** Beendete, erfolgreiche Drucke der letzten Tage ohne Auftrag */
  unassignedJobs: { id: string; name: string | null; printerName: string }[];
}

const DAY = 86_400_000;
const FOLLOW_UP_DAYS = 7;
const SOON_DAYS = 3;
const SHIPPED_WITHOUT_INVOICE_DAYS = 60;

const eur = (cents: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(cents / 100).replace(/ /g, " ");
const days = (from: Date, to: Date) => Math.floor((to.getTime() - from.getTime()) / DAY);
const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/** Passt der Druckname zu einer Position des Auftrags (gleicher Name oder einer enthält den anderen, mindestens 4 Zeichen)? */
export function jobMatchesOrder(jobName: string | null, itemNames: string[]): boolean {
  if (!jobName) return false;
  const k = nameKey(jobName);
  if (k.length < 4) return false;
  return itemNames.some((n) => {
    const i = nameKey(n);
    return i.length >= 4 && (i === k || i.includes(k) || k.includes(i));
  });
}

export function buildTodo(i: TodoInput): TodoItem[] {
  const items: TodoItem[] = [];
  const { now } = i;

  for (const inv of i.overdueInvoices) {
    const late = inv.dueDate ? Math.max(1, days(inv.dueDate, now)) : null;
    items.push({
      id: `inv-${inv.id}`,
      kind: "overdue",
      severity: "high",
      title: `Rechnung ${inv.number ?? ""} überfällig`.replace("  ", " "),
      detail: `${inv.customer} · ${eur(inv.totalCents)}${late ? ` · seit ${late} ${plural(late, "Tag", "Tagen")}` : ""} - Erinnerung oder Mahnung vorbereiten`,
      link: `/invoices/${inv.id}?dunning=1`,
    });
  }

  for (const o of i.orders) {
    const open = o.productionStatus !== "SHIPPED";
    if (o.productionStatus === "SHIPPED" && !o.hasInvoice && o.shippedAt && days(o.shippedAt, now) <= SHIPPED_WITHOUT_INVOICE_DAYS) {
      items.push({ id: `noinv-${o.id}`, kind: "no-invoice", severity: "high", title: `Auftrag ${o.number} versendet, noch keine Rechnung`, detail: `${o.customer} - Rechnung aus dem Auftrag erstellen`, link: `/orders/${o.id}` });
    }
    if (o.productionStatus === "READY_TO_SHIP") {
      items.push({ id: `ship-${o.id}`, kind: "ready-to-ship", severity: "normal", title: `Auftrag ${o.number} ist versandbereit`, detail: `${o.customer} - verpacken und versenden`, link: `/orders/${o.id}` });
    }
    // Vorschläge aus dem Stand der Drucke (nur mit Klick bestätigt)
    if (o.productionStatus === "CREATED" && o.runningJobs + o.finishedJobs > 0) {
      items.push({ id: `start-${o.id}`, kind: "suggest-in-production", severity: "normal", title: `Auftrag ${o.number}: ${o.runningJobs > 0 ? "Druck läuft" : "Druck erledigt"} - auf \"In Produktion\" setzen?`, detail: o.customer, link: `/orders/${o.id}`, action: { label: "In Produktion", method: "PATCH", url: `/production/${o.id}`, body: { productionStatus: "IN_PRODUCTION" } } });
    }
    if (o.productionStatus === "IN_PRODUCTION" && o.runningJobs === 0 && o.finishedJobs > 0) {
      items.push({ id: `ready-${o.id}`, kind: "suggest-ready", severity: "normal", title: `Auftrag ${o.number}: Der letzte Druck ist fertig - versandbereit?`, detail: `${o.customer} · ${o.finishedJobs} ${plural(o.finishedJobs, "Druck", "Drucke")} zugeordnet`, link: `/orders/${o.id}`, action: { label: "Versandbereit", method: "PATCH", url: `/production/${o.id}`, body: { productionStatus: "READY_TO_SHIP" } } });
    }
    if (open && o.expectedDeliveryDate) {
      const left = days(now, o.expectedDeliveryDate);
      if (o.expectedDeliveryDate.getTime() < now.getTime() - DAY) {
        items.push({ id: `late-${o.id}`, kind: "delivery-late", severity: "high", title: `Auftrag ${o.number}: Liefertermin überschritten`, detail: `${o.customer} - seit ${Math.abs(left)} ${plural(Math.abs(left), "Tag", "Tagen")}`, link: `/orders/${o.id}` });
      } else if (left <= SOON_DAYS) {
        items.push({ id: `soon-${o.id}`, kind: "delivery-soon", severity: "normal", title: `Auftrag ${o.number}: Liefertermin ${left <= 0 ? "heute" : left === 1 ? "morgen" : `in ${left} Tagen`}`, detail: o.customer, link: `/orders/${o.id}` });
      }
    }
  }

  for (const q of i.openQuotes) {
    if (q.hasFollowUp) continue;
    const link = `/documents?type=QUOTE&followup=${q.id}`;
    if (q.validUntil && q.validUntil.getTime() < now.getTime()) {
      const gone = Math.max(1, days(q.validUntil, now));
      items.push({ id: `qexp-${q.id}`, kind: "quote-expired", severity: "normal", title: `Angebot ${q.number} abgelaufen`, detail: `${q.customer} - seit ${gone} ${plural(gone, "Tag", "Tagen")}; nachfassen (Mail ist vorbereitet) oder als abgelehnt markieren`, link });
      continue;
    }
    const age = days(q.emailSentAt ?? q.issueDate, now);
    if (age >= FOLLOW_UP_DAYS) {
      items.push({ id: `qfu-${q.id}`, kind: "quote-follow-up", severity: "normal", title: `Angebot ${q.number}: seit ${age} Tagen keine Antwort`, detail: `${q.customer} - nachfassen (Mail ist vorbereitet)`, link });
    }
  }

  // Drucke ohne Auftrag: ein Vorschlag je Druck, wenn genau ein offener Auftrag zum Namen passt; ohne Namenstreffer nur im eindeutigen Fall
  // (genau ein Druck und genau ein Auftrag in Produktion) - sonst wird nicht geraten
  const openOrders = i.orders.filter((o) => o.productionStatus !== "SHIPPED");
  const inProduction = openOrders.filter((o) => o.productionStatus === "IN_PRODUCTION");
  let leftover = 0;
  for (const j of i.unassignedJobs) {
    const byName = openOrders.filter((o) => jobMatchesOrder(j.name, o.itemNames));
    const pick = byName.length === 1 ? { order: byName[0], why: "Name passt zu einer Position" } : byName.length === 0 && inProduction.length === 1 && i.unassignedJobs.length === 1 ? { order: inProduction[0], why: "einziger Auftrag in Produktion" } : null;
    if (!pick) {
      leftover++;
      continue;
    }
    items.push({
      id: `assign-${j.id}`,
      kind: "suggest-assign-print",
      severity: "normal",
      title: `Druck "${j.name ?? "Druckauftrag"}" (${j.printerName}) dem Auftrag ${pick.order.number} zuordnen?`,
      detail: `${pick.order.customer} - ${pick.why}; Zeit und Material gehen dann in dessen Kosten ein`,
      link: "/catalog?tab=printers",
      action: { label: "Zuordnen", method: "PATCH", url: `/printers/jobs/${j.id}`, body: { orderConfirmationId: pick.order.id } },
    });
  }

  for (const m of i.maintenanceDue) items.push({ id: `maint-${m}`, kind: "maintenance", severity: "normal", title: `Wartung fällig: ${m}`, link: "/catalog?tab=printers" });

  if (i.lowStock.length > 0) {
    const shown = i.lowStock.slice(0, 3).join(", ") + (i.lowStock.length > 3 ? ` und ${i.lowStock.length - 3} weitere` : "");
    items.push({ id: "low-stock", kind: "low-stock", severity: "normal", title: `${i.lowStock.length} ${plural(i.lowStock.length, "Material", "Materialien")} unter dem Mindestbestand`, detail: `${shown} - Nachbestellliste ansehen`, link: "/catalog?tab=materials&reorder=1" });
  }
  for (const p of i.lowProducts) {
    const n = (x: number) => new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2 }).format(x);
    items.push({ id: `lowprod-${p.id}`, kind: "low-product-stock", severity: p.stock < 0 ? "high" : "normal", title: p.stock < 0 ? `Produkt ${p.name}: mehr verkauft als im Lager (${n(p.stock)} ${p.unit})` : `Produkt ${p.name}: Lager knapp (${n(p.stock)} ${p.unit}, Mindestbestand ${n(p.min)})`, detail: "nachproduzieren - Zugang beim Produkt buchen", link: "/catalog?tab=products" });
  }
  if (i.unmatchedPayments > 0) {
    items.push({ id: "unmatched-payments", kind: "unmatched-payments", severity: "normal", title: `${i.unmatchedPayments} ${plural(i.unmatchedPayments, "Zahlungseingang", "Zahlungseingänge")} noch keiner Rechnung zugeordnet`, detail: "Vorschläge ansehen und mit einem Klick bestätigen", link: "/finance?tab=bank" });
  }
  if (leftover > 0) {
    items.push({ id: "unassigned-prints", kind: "unassigned-prints", severity: "info", title: `${leftover} ${plural(leftover, "Druck", "Drucke")} der letzten Tage ohne Auftrag`, detail: "Zeit und Material gehen so in keinen Auftrag ein - im Druckverlauf des Druckers zuordnen", link: "/catalog?tab=printers" });
  }
  if (i.oldDrafts > 0) {
    items.push({ id: "old-drafts", kind: "old-drafts", severity: "info", title: `${i.oldDrafts} ${plural(i.oldDrafts, "Entwurf liegt", "Entwürfe liegen")} seit über 3 Tagen`, detail: "fertigstellen oder verwerfen", link: "/documents?type=DRAFT" });
  }

  const rank: Record<Severity, number> = { high: 0, normal: 1, info: 2 };
  return items.map((it, idx) => ({ it, idx })).sort((a, b) => rank[a.it.severity] - rank[b.it.severity] || a.idx - b.idx).map((x) => x.it);
}
