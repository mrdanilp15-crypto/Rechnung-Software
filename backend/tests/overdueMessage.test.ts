import { describe, it, expect } from "vitest";
import { overdueMessage } from "../src/modules/invoices/overdueJob";

describe("Meldung bei überfälligen Rechnungen", () => {
  it("nennt bei einer Rechnung Nummer, Kunde und Betrag", () => {
    const m = overdueMessage([{ number: "RE-2026-0007", customer: "Max Muster", totalCents: 11900 }]);
    expect(m.title).toBe("Rechnung RE-2026-0007 ist überfällig");
    expect(m.body).toContain("Max Muster");
    expect(m.body).toContain("119,00");
  });
  it("fasst mehrere zusammen und summiert", () => {
    const m = overdueMessage([
      { number: "A", customer: "K1", totalCents: 1000 },
      { number: "B", customer: "K2", totalCents: 2000 },
      { number: "C", customer: "K3", totalCents: 3000 },
      { number: "D", customer: "K4", totalCents: 4000 },
    ]);
    expect(m.title).toBe("4 Rechnungen sind überfällig");
    expect(m.body).toContain("und 1 weitere");
    expect(m.body).toContain("100,00");
  });
});
