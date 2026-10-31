import webpush from "web-push";
import { prisma } from "../../db/prisma";
import { env } from "../../config/env";
import { logger } from "../../utils/logger";

/**
 * Push-Nachrichten aufs Handy/Tablet (Web Push): Jedes Gerät meldet sich selbst an (Einstellung in der Karte "Meldungen" auf der
 * Startseite). Die Schlüssel (VAPID) erzeugt der Server beim ersten Gebrauch und legt sie in der Tabelle Setting ab.
 * Voraussetzung am Gerät: Seite über HTTPS; auf iPhone/iPad nur, wenn die Seite als App zum Home-Bildschirm hinzugefügt wurde.
 */

export interface VapidKeys {
  publicKey: string;
  privateKey: string;
}
const KEY = "vapidKeys";

export async function getVapidKeys(companyId: string): Promise<VapidKeys> {
  const row = await prisma.setting.findUnique({ where: { companyId_key: { companyId, key: KEY } } });
  if (row) {
    try {
      const k = JSON.parse(row.value) as VapidKeys;
      if (k.publicKey && k.privateKey) return k;
    } catch {
      // wird unten neu erzeugt
    }
  }
  const keys = webpush.generateVAPIDKeys();
  await prisma.setting.upsert({
    where: { companyId_key: { companyId, key: KEY } },
    create: { companyId, key: KEY, value: JSON.stringify(keys) },
    update: { value: JSON.stringify(keys) },
  });
  return keys;
}

function subject(): string {
  const url = env.PUBLIC_APP_URL;
  return url && url.startsWith("https://") ? url : "mailto:push@example.com";
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
}
export interface StoredSubscription {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}
export type Sender = (sub: { endpoint: string; keys: { p256dh: string; auth: string } }, payload: string) => Promise<unknown>;

/** Schickt an alle Abos; Abos, die der Push-Dienst als erloschen meldet (404/410), werden zurückgemeldet. */
export async function deliverPush(subs: StoredSubscription[], payload: PushPayload, send: Sender): Promise<{ sent: number; expiredIds: string[] }> {
  const body = JSON.stringify(payload);
  const expiredIds: string[] = [];
  let sent = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await send({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body);
        sent++;
      } catch (err) {
        const code = (err as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) expiredIds.push(s.id);
        else logger.warn({ code, err: (err as Error).message }, "Push-Nachricht konnte nicht zugestellt werden");
      }
    }),
  );
  return { sent, expiredIds };
}

export async function sendPushToCompany(companyId: string, payload: PushPayload): Promise<number> {
  const subs = await prisma.pushSubscription.findMany({ where: { companyId } });
  if (subs.length === 0) return 0;
  const keys = await getVapidKeys(companyId);
  const details = { vapidDetails: { subject: subject(), publicKey: keys.publicKey, privateKey: keys.privateKey }, TTL: 60 * 60 };
  const { sent, expiredIds } = await deliverPush(subs, payload, (sub, body) => webpush.sendNotification(sub, body, details));
  if (expiredIds.length > 0) await prisma.pushSubscription.deleteMany({ where: { id: { in: expiredIds } } });
  return sent;
}
