import { describe, it, expect } from "vitest";
import { payeeName } from "../src/modules/pdf/documentTemplate";
import { buildSepaQrPayload } from "../src/modules/pdf/sepaQr";

describe("Zahlungsempfänger im QR-Code", () => {
  it("nimmt den Kontoinhaber, wenn gesetzt, sonst den Firmennamen", () => {
    expect(payeeName({ name: "HegePrint", accountHolder: "Daniel Hegemann" })).toBe("Daniel Hegemann");
    expect(payeeName({ name: "HegePrint", accountHolder: "  Daniel Hegemann  " })).toBe("Daniel Hegemann");
    expect(payeeName({ name: "HegePrint", accountHolder: "" })).toBe("HegePrint");
    expect(payeeName({ name: "HegePrint", accountHolder: null })).toBe("HegePrint");
    expect(payeeName({ name: "HegePrint" })).toBe("HegePrint");
  });
  it("der Name im GiroCode-Payload ist der Kontoinhaber (Zeile 6)", () => {
    const payload = buildSepaQrPayload({ name: payeeName({ name: "HegePrint", accountHolder: "Daniel Hegemann" }), iban: "DE89 3704 0044 0532 0130 00", amountCents: 1699, remittanceText: "RE-2026-0001" });
    const lines = payload.split("\n");
    expect(lines[5]).toBe("Daniel Hegemann");
    expect(lines[6]).toBe("DE89370400440532013000");
    expect(lines[7]).toBe("EUR16.99");
  });
});
