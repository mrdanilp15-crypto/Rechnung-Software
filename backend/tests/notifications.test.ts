import { describe, it, expect } from "vitest";
import { buildMessage, formatDuration, formatErrorCode, isEnabled, DEFAULT_SETTINGS } from "../src/modules/notifications/service";

describe("Benachrichtigungen: Texte", () => {
  it("Druck fertig mit Dauer und Verbrauch", () => {
    const m = buildMessage({ type: "PRINT_FINISHED", printerId: "p", printerName: "X1C Werkstatt", jobName: "Vase", minutes: 135, materialUsage: [{ name: "PLA schwarz", grams: 41.6 }] });
    expect(m.title).toBe('X1C Werkstatt: "Vase" ist fertig');
    expect(m.body).toContain("2 h 15 min");
    expect(m.body).toContain("PLA schwarz 42 g");
  });
  it("Fehlgeschlagen und Druckerfehler mit lesbarem Code", () => {
    expect(buildMessage({ type: "PRINT_FAILED", printerId: "p", printerName: "P1S", jobName: null, minutes: 12 }).body).toContain("fehlgeschlagen (nach 12 min)");
    const e = buildMessage({ type: "PRINTER_ERROR", printerId: "p", printerName: "P1S", jobName: "Teil", errorCode: 0x03004000 });
    expect(e.body).toContain("0300-4000");
  });
  it("Hilfsfunktionen", () => {
    expect(formatDuration(59)).toBe("59 min");
    expect(formatDuration(61)).toBe("1 h 01 min");
    expect(formatErrorCode(0x0500c010)).toBe("0500-C010");
  });
  it("Schalter je Ereignis", () => {
    expect(isEnabled("PRINT_FINISHED", { ...DEFAULT_SETTINGS, onFinish: false })).toBe(false);
    expect(isEnabled("PRINT_FAILED", DEFAULT_SETTINGS)).toBe(true);
    expect(isEnabled("PRINTER_ERROR", { ...DEFAULT_SETTINGS, onError: false })).toBe(false);
  });
});
