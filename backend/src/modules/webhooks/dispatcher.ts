import crypto from "crypto";
import axios from "axios";
import { prisma } from "../../db/prisma";
import { logger } from "../../utils/logger";
import type { EventName, EventPayload } from "../plugins/hooks";

/**
 * Sendet fachliche Ereignisse an alle registrierten Webhooks der jeweiligen Firma.
 * Payload wird per HMAC-SHA256 signiert (Header "X-Signature"), damit Empfänger die
 * Authentizität prüfen können - siehe docs/API.md, Abschnitt "Webhooks".
 */

type Target = { id: string; url: string; secret: string };

/** Einen Webhook beliefern (signiert, mit Zeitlimit, ohne Weiterleitungen) und das Ergebnis protokollieren. */
export async function deliverWebhook(webhook: Target, event: string, payload: EventPayload): Promise<{ success: boolean; status: number | null; error?: string }> {
  const body = JSON.stringify({ event, payload, sentAt: new Date().toISOString() });
  const signature = crypto.createHmac("sha256", webhook.secret).update(body).digest("hex");
  try {
    const response = await axios.post(webhook.url, body, {
      headers: { "Content-Type": "application/json", "X-Signature": signature },
      timeout: 5000,
      maxRedirects: 0,
      validateStatus: () => true,
    });
    const success = response.status >= 200 && response.status < 300;
    await prisma.webhookDelivery.create({ data: { webhookId: webhook.id, eventType: event, payload: body, responseCode: response.status, success } });
    return { success, status: response.status };
  } catch (err: any) {
    logger.warn({ err: err.message, webhookId: webhook.id, event }, "Webhook-Zustellung fehlgeschlagen");
    await prisma.webhookDelivery.create({ data: { webhookId: webhook.id, eventType: event, payload: body, responseCode: null, success: false } });
    return { success: false, status: null, error: err.code === "ECONNREFUSED" ? "Verbindung abgelehnt" : err.code === "ENOTFOUND" ? "Adresse nicht gefunden" : err.message };
  }
}

export async function dispatchWebhooks(event: EventName, payload: EventPayload) {
  const webhooks = await prisma.webhook.findMany({ where: { companyId: payload.companyId, isActive: true } });
  const relevant = webhooks.filter((w) => w.eventTypes.split(",").map((s) => s.trim()).includes(event));
  await Promise.all(relevant.map((w) => deliverWebhook(w, event, payload)));
}
