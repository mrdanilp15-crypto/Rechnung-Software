/**
 * Während eines Drucks: Wird das Material automatisch abgebucht - und wenn nicht, warum nicht? Reine Funktion (testbar).
 *
 * Gebucht wird so: Spulen mit Chip nach dem gemessenen Füllstand (braucht die Zuordnung Fach -> Material);
 * Spulen ohne Chip nach den Slicer-Werten, aber nur bei Drucken, die über die App gesendet wurden (und mit Zuordnung).
 */

export interface HintTray {
  amsSlot?: number | null;
  type: string | null;
  rfid: boolean;
  active: boolean;
}

export interface BookingHint {
  tone: "ok" | "warn";
  text: string;
}

const label = (slot: number) => `Fach ${(slot % 4) + 1}${slot >= 4 ? ` (AMS ${Math.floor(slot / 4) + 1})` : ""}`;

/**
 * @param fromApp    Der Druck wurde über die App gesendet (Slicer-Plan liegt vor)
 * @param planSlots  Fächer laut Slicer-Plan (nur bei fromApp)
 * @param mappedSlots Fächer, denen ein Material zugeordnet ist
 */
export function bookingHint(input: { fromApp: boolean; planSlots: number[]; trays: HintTray[]; mappedSlots: number[] }): BookingHint | null {
  const { fromApp, planSlots, trays, mappedSlots } = input;
  const withSlot = trays.filter((t) => t.type && t.amsSlot !== null && t.amsSlot !== undefined) as (HintTray & { amsSlot: number })[];
  // Relevant sind die Fächer des Slicer-Plans, sonst das gerade benutzte Fach
  const relevant = fromApp && planSlots.length > 0 ? withSlot.filter((t) => planSlots.includes(t.amsSlot)) : withSlot.filter((t) => t.active);
  if (relevant.length === 0) return null;

  const unmapped = relevant.filter((t) => !mappedSlots.includes(t.amsSlot));
  if (unmapped.length > 0) {
    const names = unmapped.map((t) => label(t.amsSlot)).join(", ");
    return { tone: "warn", text: `${names} ${unmapped.length === 1 ? "ist" : "sind"} keinem Material zugeordnet - dafür wird nichts abgebucht. Ordne unten ein Material zu oder lege es nach dem Druck im Druckverlauf fest.` };
  }
  const noChipNotFromApp = relevant.filter((t) => !t.rfid && !fromApp);
  if (noChipNotFromApp.length > 0) {
    return { tone: "warn", text: "Dieser Druck kam nicht aus der App und die Spule hat keinen Chip - das Material wird nicht automatisch abgebucht. Lege es nach dem Druck im Druckverlauf fest (\"Material festlegen\")." };
  }
  const chip = relevant.some((t) => t.rfid);
  const slicer = relevant.some((t) => !t.rfid);
  const how = [chip ? "nach dem Füllstand der Spule" : null, slicer ? "nach den Slicer-Werten (Druck aus der App)" : null].filter(Boolean).join(" und ");
  return { tone: "ok", text: `Das Material wird automatisch abgebucht: ${how}.` };
}
