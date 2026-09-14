import { Router } from "express";
import multer from "multer";
import { parse } from "csv-parse/sync";
import { prisma } from "../../db/prisma";
import { requireAuth, requireRole } from "../../middleware/auth";
import { HttpError } from "../../middleware/errorHandler";
import { writeAuditLog } from "../audit/auditLog";
import { nextDocumentNumber } from "../shared/numbering";

export const importRouter = Router();
importRouter.use(requireAuth, requireRole("ADMIN"));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// Importiert Kunden aus einer CSV-Datei (Spalten: name,email,phone,street,postalCode,city,country).
// Nützlich beim Onboarding neuer Benutzer/Firmen, die Bestandsdaten migrieren.
importRouter.post("/customers", upload.single("file"), async (req, res) => {
  if (!req.file) throw new HttpError(400, "Keine Datei erhalten");
  let records: Record<string, string>[];
  try {
    records = parse(req.file.buffer.toString("utf8"), { columns: true, skip_empty_lines: true, trim: true });
  } catch {
    throw new HttpError(400, "CSV konnte nicht gelesen werden");
  }
  if (records.length > 5000) throw new HttpError(400, "Maximal 5000 Zeilen pro Import erlaubt");

  let imported = 0;
  const errors: string[] = [];

  for (const [idx, row] of records.entries()) {
    if (!row.name) {
      errors.push(`Zeile ${idx + 2}: Feld "name" fehlt`);
      continue;
    }
    const customerNumber = await nextDocumentNumber(req.auth!.companyId, "CUSTOMER");
    await prisma.customer.create({
      data: {
        companyId: req.auth!.companyId,
        customerNumber,
        name: row.name,
        email: row.email || undefined,
        phone: row.phone || undefined,
        street: row.street || undefined,
        postalCode: row.postalCode || undefined,
        city: row.city || undefined,
        country: row.country || "DE",
      },
    });
    imported++;
  }

  await writeAuditLog({ req, companyId: req.auth!.companyId, userId: req.auth!.sub, action: "customer.import", entityType: "Customer", metadata: { imported, errorCount: errors.length } });
  res.json({ imported, errors });
});
