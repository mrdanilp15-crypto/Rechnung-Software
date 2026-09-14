import { Router } from "express";
import swaggerUi from "swagger-ui-express";
import fs from "fs";
import path from "path";

// Wird zur Laufzeit von der Festplatte geladen (statt statisch importiert), damit die
// JSON-Datei nicht separat vom TypeScript-Build kopiert werden muss - siehe
// scripts/copyAssets.ts, das sie neben die kompilierte JS-Datei in dist/ legt.
const spec = JSON.parse(fs.readFileSync(path.join(__dirname, "openapi.json"), "utf-8"));

export const openApiRouter = Router();

openApiRouter.get("/openapi.json", (_req, res) => res.json(spec));
openApiRouter.use("/", swaggerUi.serve, swaggerUi.setup(spec, { customSiteTitle: "API-Dokumentation" }));
