import crypto from "crypto";
import fs from "fs";
import { getFieldEncryptionKey } from "./crypto";

/**
 * AES-256-GCM-Verschlüsselung für ganze Dateien (Backup-ZIPs, siehe modules/backup/
 * runBackup.ts) - nutzt denselben persistenten Schlüssel wie die Feldverschlüsselung
 * (FIELD_ENCRYPTION_KEY), damit kein zusätzliches Secret verwaltet werden muss.
 *
 * Dateiformat: [12 Byte IV][Ciphertext...][16 Byte Auth-Tag]. Für die Dateigrößen, die
 * hier realistisch vorkommen (DB-Dump + Uploads einer kleinen Firma, i.d.R. wenige MB),
 * ist ein einfacher Ganzdatei-Ansatz im Speicher robuster als ein Streaming-Verfahren
 * und leichter korrekt zu halten.
 */
const ALGO = "aes-256-gcm";
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

export function encryptFileAes256Gcm(inputPath: string, outputPath: string): void {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGO, getFieldEncryptionKey(), iv);
  const plaintext = fs.readFileSync(inputPath);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  fs.writeFileSync(outputPath, Buffer.concat([iv, ciphertext, authTag]));
}

export function decryptFileAes256Gcm(inputPath: string, outputPath: string): void {
  const data = fs.readFileSync(inputPath);
  if (data.length < IV_LENGTH + TAG_LENGTH) throw new Error("Verschlüsselte Datei ist zu kurz/beschädigt");
  const iv = data.subarray(0, IV_LENGTH);
  const authTag = data.subarray(data.length - TAG_LENGTH);
  const ciphertext = data.subarray(IV_LENGTH, data.length - TAG_LENGTH);
  const decipher = crypto.createDecipheriv(ALGO, getFieldEncryptionKey(), iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  fs.writeFileSync(outputPath, plaintext);
}
