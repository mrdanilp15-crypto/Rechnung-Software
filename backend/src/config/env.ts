import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(4000),
  PUBLIC_APP_URL: z.string().default("http://localhost:5173"),
  DATABASE_URL: z.string(),

  JWT_ACCESS_SECRET: z.string().min(32, "JWT_ACCESS_SECRET muss mindestens 32 Zeichen lang sein"),
  JWT_REFRESH_SECRET: z.string().min(32, "JWT_REFRESH_SECRET muss mindestens 32 Zeichen lang sein"),
  JWT_ACCESS_TTL: z.string().default("15m"),
  JWT_REFRESH_TTL_DAYS: z.coerce.number().default(30),

  FIELD_ENCRYPTION_KEY: z.string().min(32, "FIELD_ENCRYPTION_KEY muss gesetzt sein"),

  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(15 * 60 * 1000),
  RATE_LIMIT_MAX: z.coerce.number().default(300),
  LOGIN_RATE_LIMIT_MAX: z.coerce.number().default(10),

  CORS_ORIGINS: z.string().default("http://localhost:5173"),

  // Ohne diesen Wert (Default: leer) ist POST /auth/register für jeden im Internet
  // erreichbar - das legt eine komplett neue, unabhängige Firma auf derselben Instanz
  // an. Für einen als Einzelfirma gedachten, selbstgehosteten Betrieb (der Normalfall
  // dieser Software) sollte hier ein zufälliger Wert gesetzt werden, sobald der erste
  // Admin-Account eingerichtet ist - danach ist ohnehin kein weiteres /register mehr
  // nötig. Ist ein Wert gesetzt, muss die Registrierung ihn als "inviteCode" mitschicken.
  REGISTRATION_INVITE_CODE: z.string().optional().default(""),

  BACKUP_DIR: z.string().default("./backups"),
  // GoBD/§147 AO verlangen eine 10-jährige Aufbewahrung der Buchführungsunterlagen -
  // ein Backup ist zwar primär eine Katastrophen-Sicherung und kein Ersatz für die
  // eigentliche Aufbewahrungspflicht (die die Live-Datenbank erfüllt, solange niemand
  // Daten löscht), aber es ist die letzte Verteidigungslinie gegen einen Totalverlust
  // der Datenbank - Backups sollten deshalb mindestens genauso lange vorgehalten werden
  // wie die gesetzliche Aufbewahrungsfrist. Bei einem Datenvolumen dieser Größenordnung
  // (ZIP aus DB-Dump + Uploads, i.d.R. wenige MB bis niedrige zweistellige MB-Zahl) ist
  // das über 10 Jahre unproblematisch günstig.
  BACKUP_RETENTION_DAYS: z.coerce.number().default(3650),
  // AES-256-GCM-Verschlüsselung der Backup-ZIPs (siehe utils/fileCrypto.ts) - standardmäßig
  // aktiv, nutzt denselben persistenten Schlüssel wie die Feldverschlüsselung
  // (FIELD_ENCRYPTION_KEY), damit kein zusätzliches Secret verwaltet werden muss.
  BACKUP_ENCRYPTION_ENABLED: z.string().default("true").transform((v) => v.toLowerCase() !== "false" && v !== "0"),
  // Bewusst kein z.coerce.boolean(): das nutzt JS Boolean(x), das jeden nicht-leeren
  // String (auch "false") als true behandelt. Env-Werte aus Docker/Portainer kommen
  // aber immer als String an, "false" muss also wirklich false ergeben.
  BACKUP_AUTO_ENABLED: z.string().default("true").transform((v) => v.toLowerCase() !== "false" && v !== "0"),
  BACKUP_INTERVAL_HOURS: z.coerce.number().default(24),

  S3_ENDPOINT: z.string().optional().default(""),
  S3_BUCKET: z.string().optional().default(""),
  S3_ACCESS_KEY_ID: z.string().optional().default(""),
  S3_SECRET_ACCESS_KEY: z.string().optional().default(""),
  S3_REGION: z.string().optional().default("eu-central-1"),

  UPLOAD_DIR: z.string().default("./uploads"),
  MAX_UPLOAD_MB: z.coerce.number().default(5),

  LOG_LEVEL: z.string().default("info"),
  // Optional: zusätzlich zu stdout auch in eine Datei in einem gemounteten Volume
  // schreiben, damit Logs einen Container-Neustart überleben (z.B. für nachträgliche
  // forensische Analyse bei einem Sicherheitsvorfall). Ohne Angabe wie bisher nur stdout.
  LOG_DIR: z.string().optional().default(""),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Ungültige Umgebungsvariablen:", parsed.error.flatten().fieldErrors);
  throw new Error("Environment validation failed. Siehe .env.example");
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === "production";
export const corsOrigins = env.CORS_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean);
