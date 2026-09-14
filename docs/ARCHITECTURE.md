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
Editieren. Die Rechnungsnummer wird bereits bei Anlage des Entwurfs vergeben (siehe
`modules/shared/numbering.ts`), damit keine Lücken durch spätere Statusänderungen entstehen.

## PDF-Generierung & PDF/A-Konformität

PDFs werden serverseitig mit `pdfkit` in `modules/pdf/documentTemplate.ts` gerendert:
dynamisches Layout mit Firmenlogo/-farbe, automatischen Seitenumbrüchen bei langen
Positionslisten, Seitenzahlen und optionalem SEPA-QR-Code (EPC069-12/GiroCode-Standard,
`modules/pdf/sepaQr.ts`) für offene Rechnungen.

**Ehrlicher Hinweis zu PDF/A:** `pdfkit` erzeugt gültiges, gut lesbares PDF 1.7 mit
eingebetteten Standard-Fonts und Dokument-Metadaten. Eine **vollständige, validierte
PDF/A-3b-Konformität** (eingebettetes ICC-Farbprofil, XMP-Metadatenschema nach ISO 19005)
ist damit *nicht* automatisch gegeben. Für rechtssichere Langzeitarchivierung nach PDF/A
empfiehlt sich ein zusätzlicher Konvertierungsschritt, z.B. via `ghostscript -dPDFA` oder
Validierung mit [veraPDF](https://verapdf.org/). Dies ist als Erweiterungspunkt vorgesehen
(siehe [STATUS.md](STATUS.md)).

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
