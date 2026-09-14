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
export async function dispatchWebhooks(event: EventName, payload: EventPayload) {
  const webhooks = await prisma.webhook.findMany({
    where: { companyId: payload.companyId, isActive: true },
  });

  const relevant = webhooks.filter((w) => w.eventTypes.split(",").map((s) => s.trim()).includes(event));

  await Promise.all(
    relevant.map(async (webhook) => {
      const body = JSON.stringify({ event, payload, sentAt: new Date().toISOString() });
      const signature = crypto.createHmac("sha256", webhook.secret).update(body).digest("hex");
      try {
        const response = await axios.post(webhook.url, body, {
          headers: { "Content-Type": "application/json", "X-Signature": signature },
          timeout: 5000,
        });
        await prisma.webhookDelivery.create({
          data: { webhookId: webhook.id, eventType: event, payload: body, responseCode: response.status, success: true },
        });
      } catch (err: any) {
        logger.warn({ err: err.message, webhookId: webhook.id, event }, "Webhook-Zustellung fehlgeschlagen");
        await prisma.webhookDelivery.create({
          data: {
            webhookId: webhook.id,
            eventType: event,
            payload: body,
            responseCode: err.response?.status ?? null,
            success: false,
          },
        });
      }
    })
  );
}
