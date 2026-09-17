import crypto from "crypto";
import { env } from "../config/env";

/**
 * Feldverschlüsselung (AES-256-GCM) für ruhende, hochsensible Daten
 * (z.B. TOTP-Secrets). Nicht für Passwörter - dafür wird Argon2id-Hashing
 * verwendet (siehe modules/auth/password.ts).
 */

const ALGO = "aes-256-gcm";

// Exportiert (statt privat), damit utils/fileCrypto.ts (Backup-Verschlüsselung) denselben
// bereits verwalteten Schlüssel wiederverwenden kann, ohne ein zweites Secret einzuführen.
export function getFieldEncryptionKey(): Buffer {
  const raw = Buffer.from(env.FIELD_ENCRYPTION_KEY, "base64");
  if (raw.length !== 32) {
    // Fällt zurück auf einen abgeleiteten 32-Byte-Schlüssel, falls der Base64-Wert
    // nicht exakt 32 Byte ergibt (z.B. Klartext-Secret in Entwicklung).
    return crypto.createHash("sha256").update(env.FIELD_ENCRYPTION_KEY).digest();
  }
  return raw;
}

export function encryptField(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, getFieldEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString("base64"), authTag.toString("base64"), encrypted.toString("base64")].join(".");
}

export function decryptField(payload: string): string {
  const [ivB64, tagB64, dataB64] = payload.split(".");
  if (!ivB64 || !tagB64 || !dataB64) throw new Error("Ungültiges verschlüsseltes Feldformat");
  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(tagB64, "base64");
  const data = Buffer.from(dataB64, "base64");
  const decipher = crypto.createDecipheriv(ALGO, getFieldEncryptionKey(), iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
  return decrypted.toString("utf8");
}

export function sha256Hex(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}
