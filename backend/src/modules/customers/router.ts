import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db/prisma";
import { requireAuth } from "../../middleware/auth";
import { HttpError } from "../../middleware/errorHandler";
import { writeAuditLog } from "../audit/auditLog";
import { nextDocumentNumber } from "../shared/numbering";

export const customersRouter = Router();
customersRouter.use(requireAuth);

customersRouter.get("/", async (req, res) => {
  const q = (req.query.q as string | undefined)?.trim();
  const customers = await prisma.customer.findMany({
    where: {
      companyId: req.auth!.companyId,
      isArchived: false,
      ...(q
        ? {
            OR: [
              { name: { contains: q } },
              { email: { contains: q } },
              { customerNumber: { contains: q } },
              { city: { contains: q } },
            ],
          }
        : {}),
    },
    orderBy: { name: "asc" },
  });
  res.json(customers);
});

customersRouter.get("/:id", async (req, res) => {
  const customer = await prisma.customer.findFirst({ where: { id: req.params.id, companyId: req.auth!.companyId } });
  if (!customer) throw new HttpError(404, "Kunde nicht gefunden");
  const [invoices, quotes] = await Promise.all([
    prisma.invoice.findMany({ where: { customerId: customer.id }, orderBy: { issueDate: "desc" } }),
    prisma.quote.findMany({ where: { customerId: customer.id }, orderBy: { issueDate: "desc" } }),
  ]);
  res.json({ ...customer, history: { invoices, quotes } });
});

const customerSchema = z.object({
  type: z.enum(["PRIVAT", "GEWERBLICH"]).default("PRIVAT"),
  name: z.string().min(1),
  contactName: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  street: z.string().optional(),
  postalCode: z.string().optional(),
  city: z.string().optional(),
  country: z.string().default("DE"),
  vatId: z.string().optional(),
  leitwegId: z.string().optional(),
  notes: z.string().optional(),
});

customersRouter.post("/", async (req, res) => {
  const body = customerSchema.parse(req.body);
  const customerNumber = await nextDocumentNumber(req.auth!.companyId, "CUSTOMER");
  const customer = await prisma.customer.create({
    data: { ...body, customerNumber, companyId: req.auth!.companyId },
  });
  await writeAuditLog({ req, companyId: req.auth!.companyId, userId: req.auth!.sub, action: "customer.create", entityType: "Customer", entityId: customer.id });
  res.status(201).json(customer);
});

customersRouter.patch("/:id", async (req, res) => {
  const body = customerSchema.partial().parse(req.body);
  const existing = await prisma.customer.findFirst({ where: { id: req.params.id, companyId: req.auth!.companyId } });
  if (!existing) throw new HttpError(404, "Kunde nicht gefunden");
  const updated = await prisma.customer.update({ where: { id: existing.id }, data: body });
  await writeAuditLog({ req, companyId: req.auth!.companyId, userId: req.auth!.sub, action: "customer.update", entityType: "Customer", entityId: existing.id, metadata: body });
  res.json(updated);
});

customersRouter.delete("/:id", async (req, res) => {
  const existing = await prisma.customer.findFirst({ where: { id: req.params.id, companyId: req.auth!.companyId } });
  if (!existing) throw new HttpError(404, "Kunde nicht gefunden");
  await prisma.customer.update({ where: { id: existing.id }, data: { isArchived: true } });
  await writeAuditLog({ req, companyId: req.auth!.companyId, userId: req.auth!.sub, action: "customer.archive", entityType: "Customer", entityId: existing.id });
  res.status(204).send();
});

// ---------- DSGVO: Auskunft & Löschung personenbezogener Daten ----------

customersRouter.get("/:id/gdpr-export", async (req, res) => {
  const customer = await prisma.customer.findFirst({ where: { id: req.params.id, companyId: req.auth!.companyId } });
  if (!customer) throw new HttpError(404, "Kunde nicht gefunden");
  const [invoices, quotes, deliveryNotes] = await Promise.all([
    prisma.invoice.findMany({ where: { customerId: customer.id }, include: { items: true } }),
    prisma.quote.findMany({ where: { customerId: customer.id }, include: { items: true } }),
    prisma.deliveryNote.findMany({ where: { customerId: customer.id }, include: { items: true } }),
  ]);
  await writeAuditLog({ req, companyId: req.auth!.companyId, userId: req.auth!.sub, action: "customer.gdpr_export", entityType: "Customer", entityId: customer.id });
  res.setHeader("Content-Disposition", `attachment; filename="dsgvo-export-${customer.customerNumber}.json"`);
  res.json({ customer, invoices, quotes, deliveryNotes });
});

// Anonymisiert personenbezogene Daten, behält aber Beleg-/Zahlenwerte für die
// gesetzliche Aufbewahrungspflicht (§147 AO, i.d.R. 10 Jahre) - "Recht auf Löschung"
// (Art. 17 DSGVO) kollidiert mit steuerrechtlichen Aufbewahrungspflichten, daher
// Anonymisierung statt Hard-Delete der Belege selbst.
customersRouter.post("/:id/gdpr-erase", async (req, res) => {
  const customer = await prisma.customer.findFirst({ where: { id: req.params.id, companyId: req.auth!.companyId } });
  if (!customer) throw new HttpError(404, "Kunde nicht gefunden");
  const anonymized = await prisma.customer.update({
    where: { id: customer.id },
    data: {
      name: "Anonymisiert",
      contactName: null,
      email: null,
      phone: null,
      street: null,
      postalCode: null,
      city: null,
      notes: null,
      isArchived: true,
    },
  });
  await writeAuditLog({ req, companyId: req.auth!.companyId, userId: req.auth!.sub, action: "customer.gdpr_erase", entityType: "Customer", entityId: customer.id });
  res.json({ ok: true, customer: anonymized });
});
