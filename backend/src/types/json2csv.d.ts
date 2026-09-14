// json2csv@5 liefert keine offiziellen TypeScript-Typen mehr aus; minimale Ambient-
// Deklaration für die im Projekt genutzte API (siehe modules/invoices/router.ts).
declare module "json2csv" {
  export class Parser<T = any> {
    constructor(opts?: Record<string, unknown>);
    parse(data: T[]): string;
  }
}
