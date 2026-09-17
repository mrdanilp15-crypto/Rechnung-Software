// Muss vor allen anderen Imports stehen: patcht Express so, dass ein throw/eine
// abgelehnte Promise in einem async-Routen-Handler korrekt an die Error-Middleware
// weitergereicht wird. Express 4 fängt das bei async-Funktionen NICHT automatisch ab -
// eine unbehandelte Promise-Rejection würde sonst den gesamten Node-Prozess beenden
// (siehe z.B. jedes `throw new HttpError(...)` in den Modul-Routern).
import "express-async-errors";
import express from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import compression from "compression";
import pinoHttp from "pino-http";
import { randomUUID } from "crypto";
import { corsOrigins, isProd } from "./config/env";
import { logger } from "./utils/logger";
import { apiRateLimiter, authRateLimiter } from "./middleware/rateLimit";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";

import { authRouter } from "./modules/auth/router";
import { usersRouter } from "./modules/users/router";
import { companiesRouter } from "./modules/companies/router";
import { customersRouter } from "./modules/customers/router";
import { productsRouter } from "./modules/products/router";
import { invoicesRouter } from "./modules/invoices/router";
import { quotesRouter } from "./modules/quotes/router";
import { deliveryNotesRouter } from "./modules/deliveryNotes/router";
import { orderConfirmationsRouter } from "./modules/orderConfirmations/router";
import { webhooksRouter } from "./modules/webhooks/router";
import { backupRouter } from "./modules/backup/router";
import { importRouter } from "./modules/export/importRouter";
import { openApiRouter } from "./modules/docs/openapi";
import { expensesRouter } from "./modules/expenses/router";
import { bankRouter } from "./modules/bank/router";
import { materialsRouter } from "./modules/materials/router";
import { auditRouter } from "./modules/audit/router";

export function createApp() {
  const app = express();

  // In Produktion i.d.R. hinter einem Reverse-Proxy (nginx/Caddy) mit TLS-Terminierung.
  app.set("trust proxy", 1);

  app.use((req, _res, next) => {
    req.requestId = randomUUID();
    next();
  });

  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => (req as any).requestId,
      customLogLevel: (_req, res) => (res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info"),
    })
  );

  app.use(
    helmet({
      contentSecurityPolicy: isProd ? undefined : false,
      crossOriginResourcePolicy: { policy: "cross-origin" },
    })
  );
  // HTTPS-Only: HSTS-Header (in Produktion; TLS selbst wird vom Reverse-Proxy terminiert).
  if (isProd) {
    app.use((req, res, next) => {
      res.setHeader("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
      next();
    });
  }

  app.use(
    cors({
      origin: corsOrigins,
      credentials: true,
    })
  );
  app.use(compression());
  app.use(express.json({ limit: "2mb" }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());

  app.use(apiRateLimiter);

  app.get("/health", (_req, res) => res.json({ status: "ok", timestamp: new Date().toISOString() }));

  app.use("/api/docs", openApiRouter);
  app.use("/api/auth", authRateLimiter, authRouter);
  app.use("/api/users", usersRouter);
  app.use("/api/companies", companiesRouter);
  app.use("/api/customers", customersRouter);
  app.use("/api/products", productsRouter);
  app.use("/api/invoices", invoicesRouter);
  app.use("/api/quotes", quotesRouter);
  app.use("/api/delivery-notes", deliveryNotesRouter);
  app.use("/api/order-confirmations", orderConfirmationsRouter);
  app.use("/api/webhooks", webhooksRouter);
  app.use("/api/backups", backupRouter);
  app.use("/api/import", importRouter);
  app.use("/api/expenses", expensesRouter);
  app.use("/api/bank", bankRouter);
  app.use("/api/materials", materialsRouter);
  app.use("/api/audit-logs", auditRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
