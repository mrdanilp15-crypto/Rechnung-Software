import { prisma } from "../../db/prisma";
import { logger } from "../../utils/logger";

export async function markOverdueInvoices() {
  const result = await prisma.invoice.updateMany({
    where: { status: "SENT", dueDate: { lt: new Date() } },
    data: { status: "OVERDUE" },
  });
  if (result.count > 0) logger.info({ count: result.count }, "Rechnungen als überfällig markiert");
}
