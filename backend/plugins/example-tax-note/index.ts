import type { Plugin } from "../../src/modules/plugins/hooks";
import { logger } from "../../src/utils/logger";

/**
 * Referenz-Plugin: protokolliert neu erstellte Rechnungen.
 * Dient als Vorlage für eigene Erweiterungen (z.B. automatische Steuerberechnung,
 * Zeiterfassung, KI-Textvorschläge) - siehe docs/DEVELOPER_GUIDE.md.
 */
const exampleTaxNotePlugin: Plugin = {
  name: "example-tax-note",
  version: "1.0.0",
  register(api) {
    api.on("invoice.created", async (payload) => {
      logger.info({ companyId: payload.companyId }, "[example-tax-note] Neue Rechnung erstellt");
    });
  },
};

export default exampleTaxNotePlugin;
