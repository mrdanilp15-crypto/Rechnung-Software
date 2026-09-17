import { Router } from "express";
import fs from "fs";
import path from "path";
import { requireAuth, requireRole } from "../../middleware/auth";
import { HttpError } from "../../middleware/errorHandler";
import { env } from "../../config/env";
import { runBackup } from "./runBackup";
import { writeAuditLog } from "../audit/auditLog";

export const backupRouter = Router();
backupRouter.use(requireAuth, requireRole("ADMIN"));

backupRouter.get("/", async (_req, res) => {
  fs.mkdirSync(env.BACKUP_DIR, { recursive: true });
  const files = fs
    .readdirSync(env.BACKUP_DIR)
    .filter((f) => f.endsWith(".zip") || f.endsWith(".zip.enc"))
    .map((f) => {
      const stat = fs.statSync(path.join(env.BACKUP_DIR, f));
      return { name: f, sizeBytes: stat.size, createdAt: stat.mtime };
    })
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  res.json(files);
});

backupRouter.post("/run", async (req, res) => {
  const zipPath = await runBackup();
  await writeAuditLog({ req, companyId: req.auth!.companyId, userId: req.auth!.sub, action: "backup.run", entityType: "Backup" });
  res.status(201).json({ file: path.basename(zipPath) });
});

backupRouter.get("/:filename/download", async (req, res) => {
  const filename = path.basename(req.params.filename); // Path-Traversal verhindern
  const fullPath = path.join(env.BACKUP_DIR, filename);
  if (!fs.existsSync(fullPath)) throw new HttpError(404, "Backup nicht gefunden");
  res.download(fullPath);
});
