# Architektur

## Überblick

```
┌─────────────────┐        HTTPS/JSON        ┌──────────────────────┐
│  React-Frontend   │ ───────────────────────▶ │  Express-API (Node)  │
│  (Vite, Tailwind)  │ ◀─────────────────────── │  TypeScript, Zod      │
└─────────────────┘                          └──────────┬───────────┘
                                                          │ Prisma ORM
                                                          ▼
                                            ┌──────────────────────────┐
                                            │      PostgreSQL           │
                                            └──────────────────────────┘
```

Das Backend ist **API-first**: Das Frontend ist ein reiner API-Konsument über `/api/*`.
Das ermöglicht künftig weitere Clients (Mobile-App, CLI, Automatisierungen) ohne
Backend-Änderungen.

## Technologieentscheidungen

| Bereich | Wahl | Begründung |
|---|---|---|
| Backend-Laufzeit | Node.js + Express + TypeScript | Großes Ökosystem, einfache Erweiterbarkeit, ein Sprachstack für Backend/Frontend |
| ORM/Datenbank | Prisma + PostgreSQL | Mehrbenutzer-/Serverbetrieb erfordert echte Nebenläufigkeit (mehrere gleichzeitige Schreibzugriffe), die eine dateibasierte Datenbank wie SQLite nicht robust leisten kann; läuft per Docker Compose ohne separate Installation |
| Geldbeträge | Ganzzahl (Cent) statt Fließkomma | Vermeidet Rundungsfehler; siehe `modules/tax/calculator.ts` |
| PDF-Erzeugung | `pdfkit` | Reines Node.js, keine Chromium-/Ghostscript-Abhängigkeit, läuft identisch auf Windows/Linux/Mac |
| Frontend | React + Vite + TypeScript + Tailwind CSS | Schnelle Entwicklung, gute Typsicherheit, Utility-CSS für konsistentes Dark/Light-Theming |
| Validierung | Zod (Backend), native HTML5 + kontrollierte Formulare (Frontend) | Laufzeit-Validierung mit TypeScript-Typinferenz aus einer Quelle |
| Auth | JWT (Access, 15 Min) + rotierende Refresh-Tokens (DB-gestützt, hashed) | Kurzlebige Access-Tokens begrenzen Schaden bei Leak; Refresh-Tokens sind widerrufbar (siehe SECURITY.md) |

## Mandantenfähigkeit

Jede Entität (Kunde, Produkt, Rechnung, ...) trägt ein `companyId`-Fremdschlüsselfeld.
Jede Anfrage ist über den Access-Token einer `companyId` zugeordnet; sämtliche
Datenbankabfragen filtern explizit danach (kein automatisches Row-Level-Security auf
DB-Ebene - siehe [SECURITY.md](SECURITY.md), Abschnitt "Bekannte Grenzen"). Eine Person
kann aktuell einer Firma angehören; mehrere Firmen pro Person (Firmenwechsel) ist ein
Roadmap-Punkt (siehe [STATUS.md](STATUS.md)).

## Datenmodell (Kernentitäten)

Vollständige, kommentierte Definition: [`backend/prisma/schema.prisma`](../backend/prisma/schema.prisma).

- **Company** - Mandant/Firma; trägt Steuer- und Bankdaten, Branding (Logo, Farbe), Standardsprache
- **User** - gehört zu genau einer Company; Rolle `ADMIN` / `MITARBEITER` / `BUCHHALTUNG`
- **RefreshToken** - gehashte, rotierende Refresh-Tokens je User
- **AuditLog** - unveränderliches Protokoll aller schreibenden Aktionen
- **Customer** - Kunde inkl. fortlaufender Kundennummer
- **Product** - Produkt-/Leistungsverzeichnis mit Preis (Cent) und USt.-Satz
- **NumberSequence** - fortlaufende Zähler je Firma/Belegtyp/Jahr (Rechnungen, Angebote, ...)
- **Invoice/InvoiceItem** - Rechnung inkl. Positionen, Status-Automat (siehe unten)
- **Quote/QuoteItem** - Angebot, konvertierbar zu Rechnung
- **DeliveryNote/DeliveryNoteItem** - Lieferschein (ohne Preise)
- **OrderConfirmation/OrderConfirmationItem** - Auftragsbestätigung
- **Setting** - generischer Key-Value-Speicher je Firma (für Plugins/Konfiguration)
- **Webhook/WebhookDelivery** - registrierte Webhook-Endpunkte + Zustellprotokoll

## Rechnungs-Statusautomat

```
DRAFT --send--> SENT --mark-paid--> PAID
  |                |--(dueDate überschritten, stündlicher Job)--> OVERDUE --mark-paid--> PAID
  |--cancel------------------------------------------------------> CANCELLED
  (SENT/OVERDUE)--cancel------------------------------------------> CANCELLED (nicht aus PAID möglich)
```

Aus GoBD-Gründen (Grundsätze zur ordnungsmäßigen Führung und Aufbewahrung von Büchern)
sind Rechnungspositionen nach Verlassen des `DRAFT`-Status **unveränderlich**. Korrekturen
erfolgen durch Stornierung (`CANCELLED`) und Neuanlage - nicht durch nachträgliches
Editieren. Die Rechnungsnummer wird erst beim ersten Verlassen des Entwurfs (Versenden bzw. "als bezahlt
markieren") vergeben (siehe `finalizeInvoiceNumber` in `modules/invoices/router.ts` und
`modules/shared/numbering.ts`), damit ein gelöschter Entwurf keine Lücke in der Nummernfolge
hinterlässt. Stornos erzeugen einen eigenen Korrekturbeleg mit eigener Nummer.

Die steuerliche Berechnung (Summen, Kleinunternehmer, innergemeinschaftliche Lieferung,
Reverse-Charge, Ausfuhr) liegt an genau einer Stelle: `modules/invoices/build.ts`
(`buildInvoiceFinancials`). Sie wird von `POST/PATCH /invoices` und von der Angebots→Rechnungs-
Umwandlung genutzt. Maßgeblich für Auslandsumsätze ist die **Art der Leistung** je Rechnung
(`supplyType`: Ware oder Dienstleistung) - siehe `modules/tax/euVat.ts`.

## PDF-Generierung & PDF/A-Konformität

PDFs werden serverseitig mit `pdfkit` in `modules/pdf/documentTemplate.ts` gerendert:
dynamisches Layout nach DIN 5008 (Anschriftenfeld im Fensterumschlag), Firmenlogo/-farbe
(zu helle Farben werden für Schrift automatisch abgedunkelt), zeilenhöhenabhängige
Positionstabelle mit automatischen Seitenumbrüchen, Laufkopf auf Folgeseiten, Entgelt je
Steuersatz, vierspaltiger Fußzeile (Firma, Kontakt, Bank, Register/Steuer-IDs) und optionalem
SEPA-QR-Code (EPC069-12/GiroCode-Standard, `modules/pdf/sepaQr.ts`) für offene Rechnungen.

**Schriften & PDF/A:** `modules/pdf/fonts.ts` sucht eine TrueType-Schrift (Liberation Sans, im
Docker-Image per `apk add font-liberation` installiert; lokal Arial als Ersatz). Sind Schriftdateien
vorhanden, wird die Schrift eingebettet und das Dokument von `pdfkit` als **PDF/A-3b** erzeugt
(ICC-Farbprofil, XMP-Metadaten, Output-Intent) - und Sonderzeichen in Kundennamen (z.B. "Ł", "ő")
werden korrekt dargestellt. Ohne Schriftdatei fällt die Vorlage auf die Standard-Schrift Helvetica
zurück (gültiges PDF 1.7, aber **nicht** PDF/A, da nicht eingebettet).

**Validierung:** Alle Belegarten wurden mit [veraPDF](https://verapdf.org/) 1.30.3 gegen PDF/A-3b geprüft
(Ergebnis: bestanden). Die Prüfung gilt für den Fall mit eingebetteter Schrift; in der Entwicklungsumgebung
wurde Arial verwendet, im Docker-Image kommt Liberation Sans zum Einsatz (gleicher Mechanismus, aber nicht
separat geprüft - bei Änderungen an der Vorlage die Prüfung wiederholen). Logo/Stempel/Unterschrift werden nur als PNG/JPEG unterstützt (pdfkit kann weder SVG
noch WebP einbetten).

## Plugin-/Hook-System

`modules/plugins/hooks.ts` stellt einen minimalen Event-Bus bereit. Fachliche Aktionen
(`invoice.created`, `invoice.paid`, `quote.accepted`, ...) lösen Events aus, auf die
Plugins reagieren können, ohne den Kern zu verändern. Referenzimplementierung:
`backend/plugins/example-tax-note`. Details und die vollständige Plugin-API stehen in
[DEVELOPER_GUIDE.md](DEVELOPER_GUIDE.md).

Jedes Event wird zusätzlich an registrierte Webhooks der jeweiligen Firma weitergeleitet
(HMAC-signiert, siehe [API.md](API.md)) - das deckt den Anforderungspunkt "Webhooks" ab,
ohne dass Drittsysteme eigene Plugins im Node-Prozess installieren müssen.

## Erweiterbarkeit: GraphQL, Zeiterfassung, KI-Textvorschläge

Diese im Lastenheft genannten Punkte sind bewusst **nicht** vorimplementiert, aber die
Architektur ist dafür vorbereitet:

- **GraphQL**: Ein GraphQL-Server (z.B. `graphql-yoga`) könnte als zusätzlicher Router
  neben `/api/*` unter `/graphql` eingehängt werden und dieselben Prisma-Modelle nutzen.
- **Zeiterfassung**: Als neues Prisma-Modell (`TimeEntry`) + eigenes Modul nach dem
  Muster von `modules/deliveryNotes` umsetzbar; könnte per Plugin an
  `invoice.created` andocken, um Stunden automatisch als Rechnungsposition vorzuschlagen.
- **KI-Textvorschläge** (z.B. Rechnungstexte, Mahntexte): Als Plugin, das bei
  `invoice.created` einen Vorschlagstext generiert und in `Setting` oder direkt im
  `notes`-Feld ablegt.

## Mehrsprachigkeit

Das Frontend ist vollständig über `i18next`/`react-i18next` lokalisiert (DE/EN,
`frontend/src/i18n/locales/*.json`). Backend-Fehlermeldungen sind aktuell auf Deutsch
hartkodiert (Zielgruppe: deutsche Kleingewerbe) - eine Internationalisierung der
API-Fehlermeldungen (z.B. über stabile `code`-Felder statt Freitext) ist ein
Roadmap-Punkt, siehe [STATUS.md](STATUS.md).
