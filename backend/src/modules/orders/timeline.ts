/** Gemeinsamer Verlauf eines Auftrags: Ereignisse aus Kommentaren, Status, Drucken, Zeiten und Dateien, neueste zuerst. */

export interface TimelineEvent {
  at: Date;
  kind: "created" | "comment" | "status" | "print" | "time" | "file";
  text: string;
  by: string | null;
  raw?: unknown;
}

const STATUS_DE: Record<string, string> = { CREATED: "Erstellt", IN_PRODUCTION: "In Produktion", READY_TO_SHIP: "Versandbereit", SHIPPED: "Versendet" };

export function buildTimeline(events: TimelineEvent[]): { at: string; kind: TimelineEvent["kind"]; text: string; by: string | null }[] {
  return [...events]
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .map((e) => ({
      at: e.at.toISOString(),
      kind: e.kind,
      // Statuswerte aus dem Protokoll auf Deutsch
      text: e.kind === "status" ? e.text.replace(/CREATED|IN_PRODUCTION|READY_TO_SHIP|SHIPPED/g, (k) => STATUS_DE[k]) : e.text,
      by: e.by,
    }));
}
