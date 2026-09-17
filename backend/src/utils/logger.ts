import pino from "pino";
import { env } from "../config/env";

const REDACT = ["req.headers.authorization", "req.headers.cookie", "*.password", "*.passwordHash", "*.totpSecret"];

// stdout bleibt immer aktiv (Docker/Portainer-Logs) - LOG_DIR ergänzt optional eine
// Datei in einem gemounteten Volume, damit Logs einen Container-Neustart überleben.
const targets: pino.TransportTargetOptions[] = [
  env.NODE_ENV === "development"
    ? { target: "pino-pretty", options: { colorize: true }, level: env.LOG_LEVEL }
    : { target: "pino/file", options: { destination: 1 }, level: env.LOG_LEVEL },
];
if (env.LOG_DIR) {
  targets.push({
    target: "pino/file",
    options: { destination: `${env.LOG_DIR}/app.log`, mkdir: true },
    level: env.LOG_LEVEL,
  });
}

export const logger = pino({
  level: env.LOG_LEVEL,
  redact: REDACT,
  transport: { targets },
});
