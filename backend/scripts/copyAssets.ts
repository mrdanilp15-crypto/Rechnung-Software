import fs from "fs";
import path from "path";

// Kopiert statische Assets (z.B. openapi.json), die tsc beim Kompilieren nicht
// automatisch mit ausgibt, in das dist/-Verzeichnis. Wird als "postbuild"-Skript ausgeführt.
const assets = [["src/modules/docs/openapi.json", "dist/src/modules/docs/openapi.json"]];

for (const [from, to] of assets) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
  console.log(`Kopiert: ${from} -> ${to}`);
}
