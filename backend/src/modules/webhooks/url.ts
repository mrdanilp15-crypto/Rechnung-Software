/**
 * Ziel-Adresse eines Webhooks prüfen. Erlaubt sind http und https, auch im Heimnetz (n8n, Home Assistant ...);
 * gesperrt sind Zugangsdaten in der Adresse und die Metadaten-Adressen von Cloud-Anbietern (Link-Local 169.254.x.x).
 */
export function checkWebhookUrl(raw: string): { ok: true } | { ok: false; error: string } {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return { ok: false, error: "Das ist keine gültige Adresse." };
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return { ok: false, error: "Nur http- und https-Adressen sind erlaubt." };
  if (u.username || u.password) return { ok: false, error: "Die Adresse darf keine Zugangsdaten enthalten (Geheimnis über die Signatur prüfen)." };
  const host = u.hostname.toLowerCase();
  if (/^169\.254\./.test(host) || host === "metadata.google.internal" || host === "0.0.0.0" || host === "[::]") return { ok: false, error: "Diese Adresse ist nicht erlaubt." };
  return { ok: true };
}
