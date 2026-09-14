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

/**
 * Erzeugt eine fortlaufende, lückenlose Belegnummer je Firma/Typ/Jahr, z.B. "RE-2026-0001".
 * Läuft innerhalb einer Transaktion, um Race Conditions bei gleichzeitigen Anfragen zu vermeiden.
 */
export async function nextDocumentNumber(
  companyId: string,
  docType: DocType,
  tx: Prisma.TransactionClient | PrismaClient = prisma
): Promise<string> {
  const year = new Date().getFullYear();
  const sequence = await tx.numberSequence.upsert({
    where: { companyId_docType_year: { companyId, docType, year } },
    create: { companyId, docType, year, lastNumber: 1, prefix: PREFIXES[docType] },
    update: { lastNumber: { increment: 1 } },
  });
  return `${PREFIXES[docType]}-${year}-${String(sequence.lastNumber).padStart(4, "0")}`;
}
