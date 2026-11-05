import { describe, it, expect } from "vitest";
import { buildTodo, type TodoInput } from "../src/modules/todo/build";

const now = new Date("2026-11-10T10:00:00Z");
const day = 86_400_000;
const ago = (d: number) => new Date(now.getTime() - d * day);
const base: TodoInput = { now, overdueInvoices: [], openQuotes: [], orders: [], oldDrafts: 0, lowStock: [], maintenanceDue: [], unassignedPrints: 0 };

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
  it("erinnert an Angebote ohne Antwort ab 7 Tagen, aber nicht an solche mit Folgebeleg", () => {
    const q = (id: string, age: number, hasFollowUp = false) => ({ id, number: id, customer: "K", issueDate: ago(age), emailSentAt: null, validUntil: null, hasFollowUp });
    const items = buildTodo({ ...base, openQuotes: [q("A", 3), q("B", 8), q("C", 20, true)] });
    expect(items.map((x) => x.id)).toEqual(["qfu-B"]);
  });
  it("meldet abgelaufene Angebote", () => {
    const items = buildTodo({ ...base, openQuotes: [{ id: "q", number: "AN-1", customer: "K", issueDate: ago(40), emailSentAt: ago(40), validUntil: ago(10), hasFollowUp: false }] });
    expect(items[0].kind).toBe("quote-expired");
  });
  it("meldet versandbereite Aufträge, Termine und versendete ohne Rechnung", () => {
    const o = (id: string, p: Partial<TodoInput["orders"][number]>) => ({ id, number: id, customer: "K", productionStatus: "IN_PRODUCTION", expectedDeliveryDate: null, shippedAt: null, hasInvoice: false, ...p });
    const items = buildTodo({
      ...base,
      orders: [
        o("ready", { productionStatus: "READY_TO_SHIP" }),
        o("late", { expectedDeliveryDate: ago(4) }),
        o("soon", { expectedDeliveryDate: new Date(now.getTime() + 1 * day) }),
        o("far", { expectedDeliveryDate: new Date(now.getTime() + 20 * day) }),
        o("shipped-noinv", { productionStatus: "SHIPPED", shippedAt: ago(5) }),
        o("shipped-inv", { productionStatus: "SHIPPED", shippedAt: ago(5), hasInvoice: true }),
      ],
    });
    const kinds = items.map((x) => x.kind);
    expect(kinds).toContain("ready-to-ship");
    expect(kinds).toContain("delivery-late");
    expect(kinds).toContain("delivery-soon");
    expect(kinds).toContain("no-invoice");
    expect(items.filter((x) => x.kind === "no-invoice")).toHaveLength(1);
    expect(items.some((x) => x.id.includes("far"))).toBe(false);
    // Wichtiges vor Normalem
    const firstNormal = items.findIndex((x) => x.severity === "normal");
    expect(items.slice(0, firstNormal).every((x) => x.severity === "high")).toBe(true);
  });
  it("fasst Entwürfe, Materialmangel und freie Drucke zusammen", () => {
    const items = buildTodo({ ...base, oldDrafts: 2, lowStock: ["A", "B", "C", "D"], unassignedPrints: 1, maintenanceDue: ["P1S · Düse"] });
    expect(items.find((x) => x.kind === "low-stock")?.detail).toBe("A, B, C und 1 weitere");
    expect(items.find((x) => x.kind === "old-drafts")?.title).toContain("2 Entwürfe liegen");
    expect(items.find((x) => x.kind === "unassigned-prints")?.title).toContain("1 Druck der");
    expect(items.find((x) => x.kind === "maintenance")?.title).toBe("Wartung fällig: P1S · Düse");
  });
});
