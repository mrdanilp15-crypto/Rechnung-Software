import { describe, it, expect } from "vitest";
import { buildTodo, jobMatchesOrder, type TodoInput, type TodoOrder } from "../src/modules/todo/build";

const now = new Date("2026-11-10T10:00:00Z");
const day = 86_400_000;
const ago = (d: number) => new Date(now.getTime() - d * day);
const base: TodoInput = { now, overdueInvoices: [], openQuotes: [], orders: [], oldDrafts: 0, lowStock: [], maintenanceDue: [], unassignedJobs: [] };
const order = (id: string, p: Partial<TodoOrder> = {}): TodoOrder => ({ id, number: id, customer: "K", productionStatus: "IN_PRODUCTION", expectedDeliveryDate: null, shippedAt: null, hasInvoice: false, itemNames: [], runningJobs: 0, finishedJobs: 0, ...p });

describe("Heute zu tun", () => {
  it("ist leer, wenn nichts ansteht", () => {
    expect(buildTodo(base)).toEqual([]);
  });
  it("listet überfällige Rechnungen mit Tagen und Mahn-Link, ganz oben", () => {
    const items = buildTodo({ ...base, lowStock: ["PLA"], overdueInvoices: [{ id: "i1", number: "RE-1", customer: "Max", totalCents: 11900, dueDate: ago(5) }] });
    expect(items[0].kind).toBe("overdue");
    expect(items[0].severity).toBe("high");
    expect(items[0].detail).toContain("seit 5 Tagen");
    expect(items[0].detail).toContain("119,00");
    expect(items[0].link).toBe("/invoices/i1?dunning=1");
  });
  it("erinnert an Angebote ohne Antwort ab 7 Tagen (mit vorbereiteter Nachfass-Mail), aber nicht an solche mit Folgebeleg", () => {
    const q = (id: string, age: number, hasFollowUp = false) => ({ id, number: id, customer: "K", issueDate: ago(age), emailSentAt: null, validUntil: null, hasFollowUp });
    const items = buildTodo({ ...base, openQuotes: [q("A", 3), q("B", 8), q("C", 20, true)] });
    expect(items.map((x) => x.id)).toEqual(["qfu-B"]);
    expect(items[0].link).toBe("/documents?type=QUOTE&followup=B");
  });
  it("meldet abgelaufene Angebote", () => {
    const items = buildTodo({ ...base, openQuotes: [{ id: "q", number: "AN-1", customer: "K", issueDate: ago(40), emailSentAt: ago(40), validUntil: ago(10), hasFollowUp: false }] });
    expect(items[0].kind).toBe("quote-expired");
  });
  it("meldet versandbereite Aufträge, Termine und versendete ohne Rechnung", () => {
    const items = buildTodo({
      ...base,
      orders: [
        order("ready", { productionStatus: "READY_TO_SHIP" }),
        order("late", { expectedDeliveryDate: ago(4) }),
        order("soon", { expectedDeliveryDate: new Date(now.getTime() + 1 * day) }),
        order("far", { expectedDeliveryDate: new Date(now.getTime() + 20 * day) }),
        order("shipped-noinv", { productionStatus: "SHIPPED", shippedAt: ago(5) }),
        order("shipped-inv", { productionStatus: "SHIPPED", shippedAt: ago(5), hasInvoice: true }),
      ],
    });
    const kinds = items.map((x) => x.kind);
    expect(kinds).toContain("ready-to-ship");
    expect(kinds).toContain("delivery-late");
    expect(kinds).toContain("delivery-soon");
    expect(kinds).toContain("no-invoice");
    expect(items.filter((x) => x.kind === "no-invoice")).toHaveLength(1);
    expect(items.some((x) => x.id.includes("far"))).toBe(false);
    const firstNormal = items.findIndex((x) => x.severity === "normal");
    expect(items.slice(0, firstNormal).every((x) => x.severity === "high")).toBe(true);
  });
  it("fasst Entwürfe, Materialmangel und freie Drucke zusammen", () => {
    const items = buildTodo({ ...base, oldDrafts: 2, lowStock: ["A", "B", "C", "D"], unassignedJobs: [{ id: "j", name: "Xyz", printerName: "P1" }], maintenanceDue: ["P1S · Düse"] });
    expect(items.find((x) => x.kind === "low-stock")?.detail).toContain("A, B, C und 1 weitere");
    expect(items.find((x) => x.kind === "low-stock")?.link).toBe("/catalog?tab=materials&reorder=1");
    expect(items.find((x) => x.kind === "old-drafts")?.title).toContain("2 Entwürfe liegen");
    expect(items.find((x) => x.kind === "unassigned-prints")?.title).toContain("1 Druck der");
    expect(items.find((x) => x.kind === "maintenance")?.title).toBe("Wartung fällig: P1S · Düse");
  });
});

describe("Vorschläge mit einem Klick", () => {
  it("Auftrag mit Druck: auf In Produktion setzen vorschlagen", () => {
    const items = buildTodo({ ...base, orders: [order("A", { productionStatus: "CREATED", runningJobs: 1 })] });
    expect(items[0].kind).toBe("suggest-in-production");
    expect(items[0].action).toEqual({ label: "In Produktion", method: "PATCH", url: "/production/A", body: { productionStatus: "IN_PRODUCTION" } });
  });
  it("Auftrag ohne Druck bekommt keinen Statusvorschlag", () => {
    expect(buildTodo({ ...base, orders: [order("A", { productionStatus: "CREATED" })] })).toEqual([]);
  });
  it("Auftrag in Produktion, alle Drucke fertig: versandbereit vorschlagen - nicht solange einer läuft", () => {
    expect(buildTodo({ ...base, orders: [order("A", { finishedJobs: 2 })] })[0].action?.body).toEqual({ productionStatus: "READY_TO_SHIP" });
    expect(buildTodo({ ...base, orders: [order("A", { finishedJobs: 2, runningJobs: 1 })] })).toEqual([]);
  });
  it("Druck wird dem Auftrag vorgeschlagen, dessen Position zum Namen passt", () => {
    const items = buildTodo({
      ...base,
      orders: [order("A", { itemNames: ["Handyhalter Print"] }), order("B", { itemNames: ["Vase groß"] })],
      unassignedJobs: [{ id: "j1", name: "Handyhalter_Print_v2", printerName: "P1S" }],
    });
    const s = items.find((x) => x.kind === "suggest-assign-print")!;
    expect(s.action).toEqual({ label: "Zuordnen", method: "PATCH", url: "/printers/jobs/j1", body: { orderConfirmationId: "A" } });
    expect(items.some((x) => x.kind === "unassigned-prints")).toBe(false);
  });
  it("bei zwei passenden Aufträgen wird nicht geraten", () => {
    const items = buildTodo({ ...base, orders: [order("A", { itemNames: ["Halter"] }), order("B", { itemNames: ["Halter groß"] })], unassignedJobs: [{ id: "j", name: "Halter", printerName: "P1" }] });
    expect(items.some((x) => x.kind === "suggest-assign-print")).toBe(false);
    expect(items.find((x) => x.kind === "unassigned-prints")?.title).toContain("1 Druck");
  });
  it("ohne Namenstreffer gilt der einzige Auftrag in Produktion", () => {
    const items = buildTodo({ ...base, orders: [order("A", { itemNames: ["Vase"] }), order("B", { productionStatus: "CREATED" })], unassignedJobs: [{ id: "j", name: "Unbekannt", printerName: "P1" }] });
    const s = items.find((x) => x.kind === "suggest-assign-print")!;
    expect(s.action?.body).toEqual({ orderConfirmationId: "A" });
    expect(s.detail).toContain("einziger Auftrag in Produktion");
  });
  it("mehrere Drucke ohne Namenstreffer werden nicht alle dem einzigen Auftrag untergeschoben", () => {
    const jobs = [{ id: "j1", name: "Aaa", printerName: "P1" }, { id: "j2", name: "Bbb", printerName: "P1" }];
    const items = buildTodo({ ...base, orders: [order("A", { itemNames: ["Vase"] })], unassignedJobs: jobs });
    expect(items.some((x) => x.kind === "suggest-assign-print")).toBe(false);
    expect(items.find((x) => x.kind === "unassigned-prints")?.title).toContain("2 Drucke");
  });
  it("versendete Aufträge sind keine Kandidaten für Drucke", () => {
    const items = buildTodo({ ...base, orders: [order("A", { productionStatus: "SHIPPED", shippedAt: ago(2), hasInvoice: true, itemNames: ["Halter"] })], unassignedJobs: [{ id: "j", name: "Halter", printerName: "P1" }] });
    expect(items.some((x) => x.kind === "suggest-assign-print")).toBe(false);
  });
  it("Namensabgleich ignoriert Endungen, Sonderzeichen und zu kurze Namen", () => {
    expect(jobMatchesOrder("Halter_v2.gcode.3mf", ["Halter v2"])).toBe(true);
    expect(jobMatchesOrder("ab", ["ab"])).toBe(false);
    expect(jobMatchesOrder(null, ["Halter"])).toBe(false);
  });
});
