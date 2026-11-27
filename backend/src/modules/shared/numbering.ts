import { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "../../db/prisma";

export type DocType = "INVOICE" | "QUOTE" | "DELIVERY_NOTE" | "ORDER_CONFIRMATION" | "CUSTOMER";

const PREFIXES: Record<DocType, string> = {
  INVOICE: "RE",
  QUOTE: "AN",
  DELIVERY_NOTE: "LS",
  ORDER_CONFIRMATION: "AB",
  CUSTOMER: "K",
};

// Kundennummern laufen über alle Jahre durch (Zeile mit year = 0) und starten bei 1001,
// damit sie sich auf einen Blick von Belegnummern wie "AB-2026-0001" unterscheiden.
const CUSTOMER_YEAR = 0;
const CUSTOMER_START = 1000;

export function formatNumber(docType: DocType, year: number, n: number): string {
  if (docType === "CUSTOMER") return `${PREFIXES.CUSTOMER}-${n}`;
  return `${PREFIXES[docType]}-${year}-${String(n).padStart(4, "0")}`;
}

/**
 * Erzeugt eine fortlaufende, lückenlose Nummer je Firma/Typ: Belege je Jahr ("RE-2026-0001"), Kunden durchgehend ("K-1001").
 * Läuft innerhalb einer Transaktion, um Race Conditions bei gleichzeitigen Anfragen zu vermeiden.
 */
export async function nextDocumentNumber(
  companyId: string,
  docType: DocType,
  tx: Prisma.TransactionClient | PrismaClient = prisma
): Promise<string> {
  const isCustomer = docType === "CUSTOMER";
  const year = isCustomer ? CUSTOMER_YEAR : new Date().getFullYear();
  // Erste Kundennummer im neuen Schema: hinter den schon vorhandenen Kunden weiterzählen
  const start = isCustomer ? CUSTOMER_START + (await tx.customer.count({ where: { companyId } })) + 1 : 1;
  const sequence = await tx.numberSequence.upsert({
    where: { companyId_docType_year: { companyId, docType, year } },
    create: { companyId, docType, year, lastNumber: start, prefix: PREFIXES[docType] },
    update: { lastNumber: { increment: 1 } },
  });
  return formatNumber(docType, year, sequence.lastNumber);
}
