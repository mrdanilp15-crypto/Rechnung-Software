import { Router } from "express";
import { z } from "zod";
import multer from "multer";
import path from "path";
import fs from "fs";
import { prisma } from "../../db/prisma";
import { requireAuth, requireRole } from "../../middleware/auth";
import { writeAuditLog } from "../audit/auditLog";
import { env } from "../../config/env";
import { encryptField } from "../../utils/crypto";
import { sendMailForCompany, isSmtpConfigured } from "../email/mailer";
import { HttpError } from "../../middleware/errorHandler";
import { getRevenueThresholdStatus } from "../tax/compliance";

export const companiesRouter = Router();
companiesRouter.use(requireAuth);

companiesRouter.get("/me", async (req, res) => {
  const company = await prisma.company.findUniqueOrThrow({ where: { id: req.auth!.companyId } });
  // Verschlüsseltes SMTP-Passwort nie an den Client ausliefern - nur ob eines hinterlegt ist.
  const { smtpPasswordEncrypted, ...rest } = company;
  res.json({ ...rest, smtpConfigured: isSmtpConfigured(company) });
});

// Nullable Felder verwenden .nullish() statt .optional(): die GET /me-Antwort liefert
// für noch nicht ausgefüllte Felder null (Prisma-Konvention für String?-Spalten), und
// das Frontend sendet beim Speichern das komplette geladene Objekt zurück. .optional()
// akzeptiert nur undefined, nicht null - das ließ jeden Speichern-Versuch mit 400
// fehlschlagen, sobald auch nur ein optionales Feld (noch) leer war.
const updateCompanySchema = z.object({
  name: z.string().min(2).optional(),
  legalForm: z.string().nullish(),
  street: z.string().nullish(),
  postalCode: z.string().nullish(),
  city: z.string().nullish(),
  country: z.string().optional(),
  taxId: z.string().nullish(),
  vatId: z.string().nullish(),
  isSmallBusiness: z.boolean().optional(),
  defaultVatRateBps: z.number().int().min(0).max(10000).optional(),
  iban: z.string().nullish(),
  bic: z.string().nullish(),
  bankName: z.string().nullish(),
  primaryColor: z.string().optional(),
  invoiceFooterText: z.string().nullish(),
  defaultLocale: z.enum(["de", "en"]).optional(),
  smallBusinessThresholdCents: z.number().int().min(0).optional(),
  smallBusinessCurrentYearThresholdCents: z.number().int().min(0).optional(),
});

companiesRouter.patch("/me", requireRole("ADMIN"), async (req, res) => {
  const body = updateCompanySchema.parse(req.body);
  const updated = await prisma.company.update({ where: { id: req.auth!.companyId }, data: body });
  await writeAuditLog({ req, companyId: req.auth!.companyId, userId: req.auth!.sub, action: "company.update", entityType: "Company", entityId: req.auth!.companyId, metadata: body });
  const { smtpPasswordEncrypted, ...rest } = updated;
  res.json({ ...rest, smtpConfigured: isSmtpConfigured(updated) });
});

// ---------- E-Mail-Versand: eigene SMTP-Zugangsdaten je Firma ----------

const smtpSchema = z.object({
  smtpHost: z.string().min(1),
  smtpPort: z.number().int().min(1).max(65535).default(587),
  smtpSecure: z.boolean().default(false),
  smtpUser: z.string().min(1),
  smtpPassword: z.string().min(1).optional(), // optional beim Update, falls nicht geändert
  smtpFromEmail: z.string().email().optional().or(z.literal("")),
  smtpFromName: z.string().optional(),
});

companiesRouter.put("/me/smtp", requireRole("ADMIN"), async (req, res) => {
  const body = smtpSchema.parse(req.body);
  const data: Record<string, unknown> = {
    smtpHost: body.smtpHost,
    smtpPort: body.smtpPort,
    smtpSecure: body.smtpSecure,
    smtpUser: body.smtpUser,
    smtpFromEmail: body.smtpFromEmail || undefined,
    smtpFromName: body.smtpFromName || undefined,
  };
  if (body.smtpPassword) data.smtpPasswordEncrypted = encryptField(body.smtpPassword);
  const updated = await prisma.company.update({ where: { id: req.auth!.companyId }, data });
  await writeAuditLog({ req, companyId: req.auth!.companyId, userId: req.auth!.sub, action: "company.smtp_update", entityType: "Company", entityId: req.auth!.companyId });
  res.json({ ok: true, smtpConfigured: isSmtpConfigured(updated) });
});

companiesRouter.delete("/me/smtp", requireRole("ADMIN"), async (req, res) => {
  await prisma.company.update({
    where: { id: req.auth!.companyId },
    data: { smtpHost: null, smtpUser: null, smtpPasswordEncrypted: null, smtpFromEmail: null, smtpFromName: null },
  });
  await writeAuditLog({ req, companyId: req.auth!.companyId, userId: req.auth!.sub, action: "company.smtp_remove", entityType: "Company", entityId: req.auth!.companyId });
  res.status(204).send();
});

// Kleinunternehmer-Schwellenwert-Warner (§19 UStG), siehe modules/tax/compliance.ts
companiesRouter.get("/me/revenue-status", async (req, res) => {
  const status = await getRevenueThresholdStatus(req.auth!.companyId);
  res.json(status);
});

companiesRouter.post("/me/smtp/test", requireRole("ADMIN"), async (req, res) => {
  const company = await prisma.company.findUniqueOrThrow({ where: { id: req.auth!.companyId } });
  if (!isSmtpConfigured(company)) throw new HttpError(400, "Kein E-Mail-Versand eingerichtet.");
  const to = req.auth!.email;
  await sendMailForCompany(company, {
    to,
    subject: "Testmail - Rechnungssoftware",
    text: `Diese Testmail bestätigt, dass der E-Mail-Versand für ${company.name} korrekt eingerichtet ist.`,
  });
  res.json({ ok: true, sentTo: to });
});

fs.mkdirSync(env.UPLOAD_DIR, { recursive: true });
const upload = multer({
  dest: env.UPLOAD_DIR,
  limits: { fileSize: env.MAX_UPLOAD_MB * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/png", "image/jpeg", "image/svg+xml", "image/webp"];
    cb(null, allowed.includes(file.mimetype));
  },
});

// Logo, Firmenstempel und Unterschrift werden identisch behandelt: hochladen, unter
// einem stabilen Dateinamen ablegen, Pfad in der jeweiligen Company-Spalte speichern.
// Stempel/Unterschrift werden automatisch von modules/pdf/documentTemplate.ts auf
// jedes erzeugte PDF (Rechnung, Angebot, Lieferschein, Auftragsbestätigung) gesetzt.
const ASSET_FIELDS = {
  logo: "logoPath",
  stamp: "stampPath",
  signature: "signaturePath",
} as const;

for (const [assetName, field] of Object.entries(ASSET_FIELDS)) {
  companiesRouter.post(`/me/${assetName}`, requireRole("ADMIN"), upload.single(assetName), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "Keine Datei erhalten oder Dateityp nicht erlaubt" });
    const ext = path.extname(req.file.originalname) || ".png";
    const finalName = `${assetName}-${req.auth!.companyId}${ext}`;
    const finalPath = path.join(env.UPLOAD_DIR, finalName);
    if (fs.existsSync(finalPath)) fs.rmSync(finalPath); // vorheriges Bild überschreiben, keine Dateileichen
    fs.renameSync(req.file.path, finalPath);
    await prisma.company.update({ where: { id: req.auth!.companyId }, data: { [field]: finalPath } });
    await writeAuditLog({ req, companyId: req.auth!.companyId, userId: req.auth!.sub, action: `company.upload_${assetName}`, entityType: "Company", entityId: req.auth!.companyId });
    res.json({ ok: true, [field]: finalPath });
  });

  companiesRouter.delete(`/me/${assetName}`, requireRole("ADMIN"), async (req, res) => {
    const company = await prisma.company.findUniqueOrThrow({ where: { id: req.auth!.companyId } });
    const currentPath = (company as any)[field] as string | null;
    if (currentPath && fs.existsSync(currentPath)) fs.rmSync(currentPath);
    await prisma.company.update({ where: { id: req.auth!.companyId }, data: { [field]: null } });
    res.status(204).send();
  });
}

// Liefert das hochgeladene Bild aus (nur für die eigene Firma - companyId aus dem
// Access-Token, kein Pfad-Traversal möglich, da der Dateiname serverseitig gebildet wird).
companiesRouter.get("/me/:asset(logo|stamp|signature)", async (req, res) => {
  const company = await prisma.company.findUniqueOrThrow({ where: { id: req.auth!.companyId } });
  const field = ASSET_FIELDS[req.params.asset as keyof typeof ASSET_FIELDS];
  const filePath = (company as any)[field] as string | null;
  if (!filePath || !fs.existsSync(filePath)) return res.status(404).json({ error: "Kein Bild hinterlegt" });
  res.sendFile(path.resolve(filePath));
});
