import { describe, it, expect } from "vitest";
import { buildTimeline } from "../src/modules/orders/timeline";

describe("Auftragsverlauf", () => {
  it("sortiert neueste zuerst und übersetzt Statuswerte", () => {
    const t = buildTimeline([
      { at: new Date("2026-11-01T10:00:00Z"), kind: "created", text: "Auftrag angelegt", by: null },
      { at: new Date("2026-11-03T10:00:00Z"), kind: "status", text: "Status: IN_PRODUCTION → READY_TO_SHIP", by: "Max" },
      { at: new Date("2026-11-02T10:00:00Z"), kind: "comment", text: "Kunde will Schwarz", by: "Max" },
    ]);
    expect(t.map((e) => e.kind)).toEqual(["status", "comment", "created"]);
    expect(t[0].text).toBe("Status: In Produktion → Versandbereit");
  });
});
