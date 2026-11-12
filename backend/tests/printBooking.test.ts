import { describe, expect, it } from "vitest";
import { bookingHint } from "../../frontend/src/lib/printBooking";

const tray = (amsSlot: number, rfid: boolean, active = false) => ({ amsSlot, type: "PLA", rfid, active });

describe("Hinweis zur Materialabbuchung während des Drucks", () => {
  it("Chip-Spule mit Zuordnung: wird nach Füllstand gebucht", () => {
    const h = bookingHint({ fromApp: false, planSlots: [], trays: [tray(1, true, true)], mappedSlots: [1] });
    expect(h?.tone).toBe("ok");
    expect(h?.text).toContain("Füllstand");
  });
  it("Spule ohne Chip, aus der App gesendet, zugeordnet: nach Slicer-Werten", () => {
    const h = bookingHint({ fromApp: true, planSlots: [0], trays: [tray(0, false), tray(1, true, true)], mappedSlots: [0] });
    expect(h?.tone).toBe("ok");
    expect(h?.text).toContain("Slicer");
    expect(h?.text).not.toContain("Füllstand"); // nur das Fach des Plans ist relevant
  });
  it("Spule ohne Chip, NICHT aus der App: Warnung mit dem Weg über den Druckverlauf (der Fall von MakerWorld/Bambu-App)", () => {
    const h = bookingHint({ fromApp: false, planSlots: [], trays: [tray(2, false, true)], mappedSlots: [2] });
    expect(h?.tone).toBe("warn");
    expect(h?.text).toContain("nicht aus der App");
    expect(h?.text).toContain("Material festlegen");
  });
  it("Fach ohne Zuordnung: Warnung mit Fachnummer", () => {
    const h = bookingHint({ fromApp: false, planSlots: [], trays: [tray(2, true, true)], mappedSlots: [] });
    expect(h?.tone).toBe("warn");
    expect(h?.text).toContain("Fach 3");
    expect(h?.text).toContain("keinem Material");
  });
  it("mehrere Fächer im Plan: ein fehlendes genügt für die Warnung", () => {
    const h = bookingHint({ fromApp: true, planSlots: [0, 1], trays: [tray(0, false), tray(1, false)], mappedSlots: [0] });
    expect(h?.tone).toBe("warn");
    expect(h?.text).toContain("Fach 2");
  });
  it("zweites AMS wird benannt", () => {
    expect(bookingHint({ fromApp: false, planSlots: [], trays: [tray(5, true, true)], mappedSlots: [] })?.text).toContain("Fach 2 (AMS 2)");
  });
  it("kein benutztes Fach erkennbar oder leere Fächer: kein Hinweis", () => {
    expect(bookingHint({ fromApp: false, planSlots: [], trays: [tray(0, true)], mappedSlots: [0] })).toBeNull();
    expect(bookingHint({ fromApp: false, planSlots: [], trays: [{ amsSlot: 0, type: null, rfid: false, active: true }], mappedSlots: [] })).toBeNull();
  });
});
