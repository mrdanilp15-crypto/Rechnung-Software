/**
 * "Heute zu tun": fasst alles zusammen, was Aufmerksamkeit braucht, in einer Liste. Reine Logik ohne Datenbankzugriff (testbar);
 * die Daten holt router.ts. Es wird nur angezeigt, nichts verändert.
 */

export type Severity = "high" | "normal" | "info";

export interface TodoItem {
  id: string;
  kind: string;
  severity: Severity;
  title: string;
  detail?: string;
  link: string;
}

export interface TodoInput {
  now: Date;
  overdueInvoices: { id: string; number: string | null; customer: string; totalCents: number; dueDate: Date | null }[];
  /** Versendete Angebote */
  openQuotes: { id: string; number: string; customer: string; issueDate: Date; emailSentAt: Date | null; validUntil: Date | null; hasFollowUp: boolean }[];
  /** Aufträge (nicht ungültig, fertiggestellt) */
  orders: { id: string; number: string; customer: string; productionStatus: string; expectedDeliveryDate: Date | null; shippedAt: Date | null; hasInvoice: boolean }[];
  oldDrafts: number;
  lowStock: string[];
  maintenanceDue: string[];
  unassignedPrints: number;
}

const DAY = 86_400_000;
const FOLLOW_UP_DAYS = 7;
const SOON_DAYS = 3;
const SHIPPED_WITHOUT_INVOICE_DAYS = 60;

const eur = (cents: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(cents / 100).replace(/ /g, " ");
const days = (from: Date, to: Date) => Math.floor((to.getTime() - from.getTime()) / DAY);
const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

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
    if (q.validUntil && q.validUntil.getTime() < now.getTime()) {
      const gone = Math.max(1, days(q.validUntil, now));
      items.push({ id: `qexp-${q.id}`, kind: "quote-expired", severity: "normal", title: `Angebot ${q.number} abgelaufen`, detail: `${q.customer} - seit ${gone} ${plural(gone, "Tag", "Tagen")}; nachfassen, verlängern oder als abgelehnt markieren`, link: `/documents?type=QUOTE` });
      continue;
    }
    const age = days(q.emailSentAt ?? q.issueDate, now);
    if (age >= FOLLOW_UP_DAYS) {
      items.push({ id: `qfu-${q.id}`, kind: "quote-follow-up", severity: "normal", title: `Angebot ${q.number}: seit ${age} Tagen keine Antwort`, detail: `${q.customer} - nachfassen`, link: `/documents?type=QUOTE` });
    }
  }

  for (const m of i.maintenanceDue) items.push({ id: `maint-${m}`, kind: "maintenance", severity: "normal", title: `Wartung fällig: ${m}`, link: "/catalog?tab=printers" });

  if (i.lowStock.length > 0) {
    const shown = i.lowStock.slice(0, 3).join(", ") + (i.lowStock.length > 3 ? ` und ${i.lowStock.length - 3} weitere` : "");
    items.push({ id: "low-stock", kind: "low-stock", severity: "normal", title: `${i.lowStock.length} ${plural(i.lowStock.length, "Material", "Materialien")} unter dem Mindestbestand`, detail: shown, link: "/catalog?tab=materials" });
  }
  if (i.unassignedPrints > 0) {
    items.push({ id: "unassigned-prints", kind: "unassigned-prints", severity: "info", title: `${i.unassignedPrints} ${plural(i.unassignedPrints, "Druck", "Drucke")} der letzten Tage ohne Auftrag`, detail: "Zeit und Material gehen so in keinen Auftrag ein - im Druckverlauf des Druckers zuordnen", link: "/catalog?tab=printers" });
  }
  if (i.oldDrafts > 0) {
    items.push({ id: "old-drafts", kind: "old-drafts", severity: "info", title: `${i.oldDrafts} ${plural(i.oldDrafts, "Entwurf liegt", "Entwürfe liegen")} seit über 3 Tagen`, detail: "fertigstellen oder verwerfen", link: "/documents?type=DRAFT" });
  }

  const rank: Record<Severity, number> = { high: 0, normal: 1, info: 2 };
  return items.map((it, idx) => ({ it, idx })).sort((a, b) => rank[a.it.severity] - rank[b.it.severity] || a.idx - b.idx).map((x) => x.it);
}
