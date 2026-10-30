import { describe, it, expect } from "vitest";
import { LOGO_CID, buildMailHtml, escapeHtml, textToHtml } from "../src/modules/email/mailHtml";

const branding = { name: "HegePrint", legalForm: "Einzelunternehmen", street: "Musterstr. 1", postalCode: "12345", city: "Berlin", phone: "0123 456", email: "info@hegeprint.de", website: "www.hegeprint.de", vatId: null, taxId: "12/345/67890", primaryColor: "#0284c7" };

describe("E-Mail als HTML", () => {
  it("bettet das Logo per cid ein und nennt sonst den Firmennamen", () => {
    const withLogo = buildMailHtml(branding, "Hallo", { hasLogo: true });
    expect(withLogo).toContain(`src="cid:${LOGO_CID}"`);
    const without = buildMailHtml(branding, "Hallo", { hasLogo: false });
    expect(without).not.toContain("cid:");
    expect(without).toContain(">HegePrint</span>");
  });
  it("übernimmt die Firmenfarbe und ignoriert ungültige Farbwerte", () => {
    expect(buildMailHtml(branding, "x", { hasLogo: false })).toContain("border-bottom:3px solid #0284c7");
    expect(buildMailHtml({ ...branding, primaryColor: "red;} body{display:none" }, "x", { hasLogo: false })).toContain("border-bottom:3px solid #2563eb");
  });
  it("zeigt Anhänge und Firmendaten im Fuß", () => {
    const html = buildMailHtml(branding, "Hallo", { hasLogo: false, attachmentNames: ["AN-2026-0001.pdf"] });
    expect(html).toContain("Anhang: AN-2026-0001.pdf");
    expect(html).toContain("HegePrint Einzelunternehmen");
    expect(html).toContain("Musterstr. 1, 12345 Berlin");
    expect(html).toContain("Steuernr. 12/345/67890");
    expect(html).not.toContain("USt-IdNr.");
  });
  it("maskiert HTML im Text und macht Links anklickbar", () => {
    expect(escapeHtml(`<b>"x"</b> & 'y'`)).toBe("&lt;b&gt;&quot;x&quot;&lt;/b&gt; &amp; &#39;y&#39;");
    const html = textToHtml("Hallo <script>alert(1)</script>\n\nLink: https://example.com/reset?token=abc.", "#111111");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain('<a href="https://example.com/reset?token=abc" style="color:#111111');
    expect(html.match(/<p /g)).toHaveLength(2);
  });
  it("macht aus einfachen Zeilenumbrüchen <br> und aus Leerzeilen Absätze", () => {
    const html = textToHtml("Mit freundlichen Grüßen\nHegePrint\n\nPS: Danke", "#000000");
    expect(html).toContain("Grüßen<br>HegePrint");
    expect(html.match(/<p /g)).toHaveLength(2);
  });
  it("maskiert auch den Firmennamen", () => {
    expect(buildMailHtml({ ...branding, name: 'A&B <Druck>' }, "x", { hasLogo: false })).toContain("A&amp;B &lt;Druck&gt;");
  });
});
