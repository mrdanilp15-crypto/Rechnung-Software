import { Router, type Request } from "express";
import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import { z } from "zod";
import { prisma } from "../../db/prisma";
import { env } from "../../config/env";
import { requireAuth } from "../../middleware/auth";
import { HttpError } from "../../middleware/errorHandler";
import { writeAuditLog } from "../audit/auditLog";
import { resolvePdfFonts } from "../pdf/fonts";

/**
 * QR-Etiketten: Der Code enthält nur einen Link (/q/<Art>/<ID>) auf diese Software. Wer scannt, muss angemeldet sein und sieht
 * dann die Seite des Artikels (Material, Spule, Produkt, Drucker). Spulen sind einzelne Rollen eines Materials und tragen
 * u.a. das Kennzeichen "Altbestand vor Geschäftsbeginn".
 */

export const qrRouter = Router();
export const spoolsRouter = Router();
qrRouter.use(requireAuth);
spoolsRouter.use(requireAuth);

const TYPES = ["material", "spool", "product", "printer"] as const;
type QrType = (typeof TYPES)[number];

/** Basisadresse des Links im Code: PUBLIC_APP_URL, sonst die Adresse, unter der die Anfrage ankam. */
export function baseUrl(req: Request): string {
  if (env.PUBLIC_APP_URL && !/localhost|127\.0\.0\.1/.test(env.PUBLIC_APP_URL)) return env.PUBLIC_APP_URL.replace(/\/$/, "");
  const proto = (req.headers["x-forwarded-proto"] as string | undefined)?.split(",")[0] ?? req.protocol;
  return `${proto}://${req.get("host")}`;
}
export const itemUrl = (base: string, type: QrType, id: string) => `${base}/q/${type}/${id}`;

// ---------- Spulen ----------

const spoolSchema = z.object({
  label: z.string().trim().max(60).nullish(),
  initialGrams: z.number().int().min(1).max(20000).optional(),
  remainingGrams: z.number().int().min(0).max(20000).nullish(),
  preBusiness: z.boolean().optional(),
  acquiredAt: z.coerce.date().nullish(),
  note: z.string().trim().max(500).nullish(),
  isEmpty: z.boolean().optional(),
});

spoolsRouter.get("/", async (req, res) => {
  const materialId = typeof req.query.materialId === "string" ? req.query.materialId : undefined;
  res.json(await prisma.spool.findMany({ where: { companyId: req.auth!.companyId, ...(materialId ? { materialId } : {}) }, orderBy: [{ isEmpty: "asc" }, { createdAt: "asc" }] }));
});

// Mehrere Spulen eines Materials auf einmal anlegen (z.B. 5 Rollen aus einer Lieferung)
spoolsRouter.post("/", async (req, res) => {
  const companyId = req.auth!.companyId;
  const body = spoolSchema.extend({ materialId: z.string().min(1), count: z.number().int().min(1).max(50).default(1) }).parse(req.body);
  const material = await prisma.material.findFirst({ where: { id: body.materialId, companyId }, select: { id: true, name: true } });
  if (!material) throw new HttpError(404, "Material nicht gefunden");
  const existing = await prisma.spool.count({ where: { materialId: material.id } });
  const { count, materialId, ...data } = body;
  const created = [];
  for (let i = 0; i < count; i++) {
    created.push(await prisma.spool.create({ data: { ...data, companyId, materialId, label: data.label ? (count > 1 ? `${data.label} ${i + 1}` : data.label) : `Spule ${existing + i + 1}`, remainingGrams: data.remainingGrams ?? data.initialGrams ?? 1000 } }));
  }
  await writeAuditLog({ req, companyId, userId: req.auth!.sub, action: "spool.create", entityType: "Material", entityId: material.id, metadata: { count, preBusiness: !!body.preBusiness } });
  res.status(201).json(created);
});

spoolsRouter.patch("/:id", async (req, res) => {
  const companyId = req.auth!.companyId;
  const body = spoolSchema.parse(req.body);
  const s = await prisma.spool.findFirst({ where: { id: req.params.id, companyId } });
  if (!s) throw new HttpError(404, "Spule nicht gefunden");
  res.json(await prisma.spool.update({ where: { id: s.id }, data: { ...body, label: body.label === undefined ? undefined : body.label || null, note: body.note === undefined ? undefined : body.note || null } }));
});

spoolsRouter.delete("/:id", async (req, res) => {
  const s = await prisma.spool.findFirst({ where: { id: req.params.id, companyId: req.auth!.companyId } });
  if (!s) throw new HttpError(404, "Spule nicht gefunden");
  await prisma.spool.delete({ where: { id: s.id } });
  res.status(204).send();
});

// ---------- Auflösen (für die Scan-Seite) ----------

async function describe(companyId: string, type: QrType, id: string) {
  if (type === "material") {
    const m = await prisma.material.findFirst({ where: { id, companyId }, include: { supplier: { select: { name: true } }, spools: { orderBy: [{ isEmpty: "asc" }, { createdAt: "asc" }] } } });
    if (!m) throw new HttpError(404, "Material nicht gefunden");
    return { type, id, title: m.name, lines: [`Bestand ${m.stockQuantity} ${m.unit}`, m.minStock ? `Mindestbestand ${m.minStock} ${m.unit}` : "", m.supplier?.name ? `Lieferant ${m.supplier.name}` : ""].filter(Boolean), material: { id: m.id, unit: m.unit, stockQuantity: m.stockQuantity, minStock: m.minStock, costPerUnitCents: m.costPerUnitCents }, spools: m.spools };
  }
  if (type === "spool") {
    const s = await prisma.spool.findFirst({ where: { id, companyId }, include: { material: { select: { id: true, name: true, unit: true } } } });
    if (!s) throw new HttpError(404, "Spule nicht gefunden");
    return { type, id, title: `${s.material.name}${s.label ? ` - ${s.label}` : ""}`, lines: [], spool: s, material: s.material };
  }
  if (type === "product") {
    const p = await prisma.product.findFirst({ where: { id, companyId } });
    if (!p) throw new HttpError(404, "Produkt nicht gefunden");
    return { type, id, title: p.name, lines: [p.sku ? `Artikelnummer ${p.sku}` : "", `Preis ${(p.unitPriceCents / 100).toFixed(2).replace(".", ",")} € je ${p.unit}`].filter(Boolean) };
  }
  const pr = await prisma.printer.findFirst({ where: { id, companyId } });
  if (!pr) throw new HttpError(404, "Drucker nicht gefunden");
  return { type, id, title: pr.name, lines: [pr.model ?? "", pr.serial ? `Seriennummer ${pr.serial}` : ""].filter(Boolean) };
}

const typeParam = (v: string): QrType => {
  if (!(TYPES as readonly string[]).includes(v)) throw new HttpError(400, "Unbekannte Art");
  return v as QrType;
};

qrRouter.get("/resolve/:type/:id", async (req, res) => {
  res.json(await describe(req.auth!.companyId, typeParam(req.params.type), req.params.id));
});

// ---------- Bild und Etiketten ----------

qrRouter.get("/:type/:id.png", async (req, res) => {
  const type = typeParam(req.params.type);
  await describe(req.auth!.companyId, type, req.params.id);
  const png = await QRCode.toBuffer(itemUrl(baseUrl(req), type, req.params.id), { margin: 1, width: 400, errorCorrectionLevel: "M" });
  res.setHeader("Content-Type", "image/png");
  res.setHeader("Cache-Control", "no-store");
  res.send(png);
});

const MM = 72 / 25.4;
export const LABEL_FORMATS = {
  "62x29": { label: "62 × 29 mm (Brother QL, Endlosrolle)", w: 62 * MM, h: 29 * MM, cols: 1, rows: 1, pageW: 62 * MM, pageH: 29 * MM },
  "50x30": { label: "50 × 30 mm", w: 50 * MM, h: 30 * MM, cols: 1, rows: 1, pageW: 50 * MM, pageH: 30 * MM },
  a4: { label: "A4-Bogen, 3 × 8 Etiketten (70 × 37 mm)", w: 70 * MM, h: 37 * MM, cols: 3, rows: 8, pageW: 210 * MM, pageH: 297 * MM },
} as const;
export type LabelFormat = keyof typeof LABEL_FORMATS;

const labelQuery = z.object({
  type: z.enum(TYPES),
  ids: z.string().min(1).max(4000),
  format: z.enum(["62x29", "50x30", "a4"]).default("62x29"),
});

interface LabelItem {
  url: string;
  title: string;
  sub: string;
  tag: string | null;
}

async function labelItems(req: Request, type: QrType, ids: string[]): Promise<LabelItem[]> {
  const out: LabelItem[] = [];
  const base = baseUrl(req);
  for (const id of ids.slice(0, 200)) {
    const d = await describe(req.auth!.companyId, type, id);
    const spool = (d as { spool?: { preBusiness: boolean; label: string | null; initialGrams: number } }).spool;
    out.push({
      url: itemUrl(base, type, id),
      title: type === "spool" ? (d as { material: { name: string } }).material.name : d.title,
      sub: type === "spool" ? [spool?.label, spool ? `${spool.initialGrams} g` : ""].filter(Boolean).join(" · ") : d.lines[0] ?? "",
      tag: spool?.preBusiness ? "ALTBESTAND" : null,
    });
  }
  return out;
}

/** Etiketten als PDF: eine Etikettengröße pro Seite (Rollendrucker) oder ein A4-Bogen mit Raster. Gedruckt wird über den normalen Druckdialog. */
qrRouter.get("/labels.pdf", async (req, res) => {
  const q = labelQuery.parse(req.query);
  const f = LABEL_FORMATS[q.format];
  const items = await labelItems(req, q.type, q.ids.split(",").map((s) => s.trim()).filter(Boolean));
  if (items.length === 0) throw new HttpError(400, "Keine Etiketten gewählt.");

  const fonts = resolvePdfFonts();
  const doc = new PDFDocument({ size: [f.pageW, f.pageH], margin: 0, font: fonts.regular, info: { Title: "QR-Etiketten" } });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));

  const perPage = f.cols * f.rows;
  const offX = (f.pageW - f.cols * f.w) / 2;
  const offY = f.rows > 1 ? (f.pageH - f.rows * f.h) / 2 : 0;
  for (let i = 0; i < items.length; i++) {
    if (i > 0 && i % perPage === 0) doc.addPage({ size: [f.pageW, f.pageH], margin: 0 });
    const slot = i % perPage;
    const x = offX + (slot % f.cols) * f.w;
    const y = offY + Math.floor(slot / f.cols) * f.h;
    const it = items[i];
    const pad = 3 * MM;
    const qr = Math.min(f.h - 2 * pad, 26 * MM);
    doc.image(await QRCode.toBuffer(it.url, { margin: 0, width: 300, errorCorrectionLevel: "M" }), x + pad, y + (f.h - qr) / 2, { width: qr, height: qr });
    const tx = x + pad + qr + 2.5 * MM;
    const tw = f.w - (tx - x) - pad;
    doc.fillColor("#000").font(fonts.bold).fontSize(f.h > 33 * MM ? 11 : 9).text(it.title, tx, y + pad, { width: tw, height: f.h * 0.5, ellipsis: true });
    if (it.sub) doc.font(fonts.regular).fontSize(8).text(it.sub, tx, doc.y + 1, { width: tw, ellipsis: true });
    if (it.tag) doc.font(fonts.bold).fontSize(8).text(it.tag, tx, y + f.h - pad - 9, { width: tw });
  }
  doc.end();
  const pdf = await done;
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", 'inline; filename="qr-etiketten.pdf"');
  res.setHeader("Cache-Control", "no-store");
  res.send(pdf);
});

qrRouter.get("/formats", (_req, res) => {
  res.json(Object.entries(LABEL_FORMATS).map(([key, v]) => ({ key, label: v.label })));
});
