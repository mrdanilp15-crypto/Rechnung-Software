/**
 * Kalenderfeed (ICS) für Handy-/Desktop-Kalender: Liefertermine, Zahlungsziele, Angebots-Fristen und Wartungstermine als ganztägige Einträge.
 * Reine Logik ohne Datenbankzugriff; die Daten holt router.ts. Der Feed enthält Belegnummern und Kundennamen, aber keine Beträge.
 */

export interface CalendarEvent {
  /** Stabile ID: derselbe Termin behält im Kalender seine Identität */
  uid: string;
  /** Tag (Jahr-Monat-Tag in lokaler Zeit des Betriebs, hier als UTC-Datum übergeben) */
  date: Date;
  title: string;
  description?: string;
  /** Link zurück in die Software */
  url?: string;
}

/** Text für ICS maskieren: Backslash, Semikolon, Komma und Zeilenumbrüche. */
export function escapeIcs(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Zeilen länger als 75 Bytes werden gefaltet (Folgezeile beginnt mit einem Leerzeichen). */
export function foldLine(line: string): string {
  const bytes = (s: string) => Buffer.byteLength(s, "utf8");
  if (bytes(line) <= 75) return line;
  const out: string[] = [];
  let cur = "";
  for (const ch of line) {
    const limit = out.length === 0 ? 75 : 74; // Folgezeilen haben das führende Leerzeichen
    if (bytes(cur + ch) > limit) {
      out.push(cur);
      cur = ch;
    } else {
      cur += ch;
    }
  }
  if (cur) out.push(cur);
  return out.map((l, i) => (i === 0 ? l : " " + l)).join("\r\n");
}

const pad = (n: number) => String(n).padStart(2, "0");
const dateValue = (d: Date) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
const stamp = (d: Date) => `${dateValue(d)}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;

export function buildIcs(events: CalendarEvent[], calendarName: string, now: Date = new Date()): string {
  const lines: string[] = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Rechnungssoftware//Termine//DE", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", `X-WR-CALNAME:${escapeIcs(calendarName)}`, "REFRESH-INTERVAL;VALUE=DURATION:PT1H", "X-PUBLISHED-TTL:PT1H"];
  for (const e of events) {
    const next = new Date(e.date.getTime() + 86_400_000); // ganztägig: Ende ist der folgende Tag
    lines.push("BEGIN:VEVENT", `UID:${e.uid}@rechnungssoftware`, `DTSTAMP:${stamp(now)}`, `DTSTART;VALUE=DATE:${dateValue(e.date)}`, `DTEND;VALUE=DATE:${dateValue(next)}`, `SUMMARY:${escapeIcs(e.title)}`);
    if (e.description) lines.push(`DESCRIPTION:${escapeIcs(e.description)}`);
    if (e.url) lines.push(`URL:${e.url}`);
    lines.push("TRANSP:TRANSPARENT", "END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join("\r\n") + "\r\n";
}
