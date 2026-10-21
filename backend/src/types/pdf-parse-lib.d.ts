// pdf-parse: Der Haupteinstieg liest beim Import eine Testdatei (bekannter Fehler im Paket) - deshalb direkt die Bibliotheksdatei laden.
declare module "pdf-parse/lib/pdf-parse.js" {
  function pdfParse(data: Buffer, options?: Record<string, unknown>): Promise<{ numpages: number; text: string }>;
  export = pdfParse;
}
