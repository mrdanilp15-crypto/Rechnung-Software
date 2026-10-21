import { describe, it, expect } from "vitest";
import { detectFileType, parseTags, safeFileName, snippetFor } from "../src/modules/archive/fileType";

const buf = (...bytes: number[]) => Buffer.from(bytes);

describe("Belegarchiv: Dateityp-Erkennung", () => {
  it("erkennt PDF und Bilder am Inhalt", () => {
    expect(detectFileType(Buffer.from("%PDF-1.7 ..."), "rechnung.pdf")?.mime).toBe("application/pdf");
    expect(detectFileType(buf(0x89, 0x50, 0x4e, 0x47, 0, 0), "foto.PNG")?.mime).toBe("image/png");
    expect(detectFileType(buf(0xff, 0xd8, 0xff, 0xe0), "scan.jpeg")?.ext).toBe(".jpg");
    expect(detectFileType(Buffer.concat([Buffer.from("RIFF"), buf(0, 0, 0, 0), Buffer.from("WEBPVP8 ")]), "x.webp")?.mime).toBe("image/webp");
  });
  it("lehnt getarnte oder unbekannte Dateien ab", () => {
    expect(detectFileType(Buffer.from("<html><script>alert(1)</script>"), "rechnung.pdf")).toBeNull();
    expect(detectFileType(Buffer.from("<html></html>"), "seite.html")).toBeNull();
    expect(detectFileType(buf(0x4d, 0x5a, 0x90, 0), "programm.exe")).toBeNull();
    expect(detectFileType(Buffer.from("%PDF-1.4"), "datei.exe")).toBeNull();
  });
  it("Office-Dateien brauchen passende Endung, Textdateien dürfen keine Binärdaten enthalten", () => {
    expect(detectFileType(buf(0x50, 0x4b, 3, 4, 0), "vertrag.docx")?.inline).toBe(false);
    expect(detectFileType(buf(0x50, 0x4b, 3, 4, 0), "vertrag.exe")).toBeNull();
    expect(detectFileType(Buffer.from("a;b;c\n1;2;3"), "liste.csv")?.text).toBe(true);
    expect(detectFileType(buf(0x61, 0, 0x62), "liste.csv")).toBeNull();
    expect(detectFileType(Buffer.from("<xrechnung/>"), "rechnung.xml")?.mime).toBe("application/xml");
  });
});

describe("Belegarchiv: Hilfsfunktionen", () => {
  it("bereinigt Dateinamen", () => {
    expect(safeFileName("../../etc/passwd")).toBe("passwd");
    expect(safeFileName(["C:", "Users", "x", "Beleg: 1?.pdf"].join(String.fromCharCode(92)))).toBe("Beleg_ 1_.pdf");
    expect(safeFileName("")).toBe("datei");
    expect(safeFileName("a".repeat(300)).length).toBe(150);
  });
  it("normalisiert Tags", () => {
    expect(parseTags("Steuer, steuer ;  2026 , ,Büro")).toEqual(["steuer", "2026", "büro"]);
    expect(parseTags(["A", "b", "a"])).toEqual(["a", "b"]);
    expect(parseTags(undefined)).toEqual([]);
    expect(parseTags(Array.from({ length: 30 }, (_, i) => `t${i}`)).length).toBe(10);
  });
  it("liefert Textausschnitte um Treffer", () => {
    const text = "Lorem ipsum ".repeat(20) + "Filament PLA schwarz 1kg " + "dolor sit ".repeat(20);
    const s = snippetFor(text, ["filament"]);
    expect(s).toContain("Filament PLA schwarz");
    expect(s!.startsWith("…")).toBe(true);
    expect(snippetFor(text, ["nichtvorhanden"])).toBeNull();
    expect(snippetFor(null, ["x"])).toBeNull();
  });
});
