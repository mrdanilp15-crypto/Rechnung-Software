import { logger } from "../../utils/logger";

/**
 * Minimalistisches Plugin-/Hook-System.
 *
 * Plugins registrieren sich über `registerPlugin()` und lauschen auf fachliche
 * Ereignisse (z.B. "invoice.created", "invoice.paid"). Damit lassen sich Erweiterungen
 * wie automatische Steuerberechnung, Zeiterfassung oder KI-Textvorschläge realisieren,
 * ohne den Kern der Anwendung zu verändern.
 *
 * Siehe backend/plugins/example-tax-note für ein Referenz-Plugin und
 * docs/DEVELOPER_GUIDE.md für die vollständige Plugin-API.
 */

export type EventName =
  | "invoice.created"
  | "invoice.sent"
  | "invoice.paid"
  | "invoice.overdue"
  | "quote.created"
  | "quote.accepted"
  | "quote.expired"
  | "customer.created"
  | "order.status_changed"
  | "print.ended"
  | "stock.low";

/** Alle Ereignisse mit Beschreibung - für die Auswahl bei den Webhooks und die API-Doku. */
export const EVENT_CATALOG: { name: EventName; label: string }[] = [
  { name: "invoice.created", label: "Rechnung angelegt" },
  { name: "invoice.sent", label: "Rechnung fertiggestellt/versendet" },
  { name: "invoice.paid", label: "Rechnung bezahlt (auch durch den Bankabgleich)" },
  { name: "invoice.overdue", label: "Rechnung ist überfällig geworden" },
  { name: "quote.created", label: "Angebot angelegt" },
  { name: "quote.accepted", label: "Angebot angenommen" },
  { name: "quote.expired", label: "Angebot abgelaufen" },
  { name: "customer.created", label: "Kunde angelegt" },
  { name: "order.status_changed", label: "Auftragsstatus geändert (Produktion)" },
  { name: "print.ended", label: "Druck beendet (fertig oder fehlgeschlagen)" },
  { name: "stock.low", label: "Material unter dem Mindestbestand" },
];

export type EventPayload = { companyId: string; [key: string]: unknown };
export type EventHandler = (payload: EventPayload) => void | Promise<void>;

const handlers = new Map<EventName, EventHandler[]>();

export interface Plugin {
  name: string;
  version: string;
  register(api: { on: (event: EventName, handler: EventHandler) => void }): void;
}

const loadedPlugins: Plugin[] = [];

export function registerPlugin(plugin: Plugin) {
  plugin.register({
    on: (event, handler) => {
      const list = handlers.get(event) ?? [];
      list.push(handler);
      handlers.set(event, list);
    },
  });
  loadedPlugins.push(plugin);
  logger.info({ plugin: plugin.name, version: plugin.version }, "Plugin geladen");
}

export function getLoadedPlugins() {
  return loadedPlugins.map((p) => ({ name: p.name, version: p.version }));
}

export async function emitEvent(event: EventName, payload: EventPayload) {
  const list = handlers.get(event) ?? [];
  for (const handler of list) {
    try {
      await handler(payload);
    } catch (err) {
      logger.error({ err, event }, "Fehler in Plugin-Hook-Handler");
    }
  }
  // Zusätzlich an registrierte Webhooks der Firma weiterleiten (entkoppelt, siehe webhooks/dispatcher.ts).
  const { dispatchWebhooks } = await import("../webhooks/dispatcher");
  await dispatchWebhooks(event, payload);
}
