# Rechnungs- und Verwaltungssoftware

Mehrbenutzerfähige, DSGVO-konforme Rechnungs- und Verwaltungssoftware für Kleingewerbe
(Referenzfall: 3D-Druck-Dienstleistungen). Modular aufgebautes Backend (Node.js/Express/
TypeScript/Prisma) mit React-Frontend, PDF-Generierung, Mandantenfähigkeit, Rollen &
Rechten, Audit-Log, Plugin-System und REST-API mit OpenAPI-Dokumentation.

## Inhaltsverzeichnis der Dokumentation

| Dokument | Inhalt |
|---|---|
| [docs/INSTALL.md](docs/INSTALL.md) | Installation, Konfiguration, Start (lokal, Docker, Windows) |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Systemarchitektur, Datenmodell, Technologieentscheidungen |
| [docs/SECURITY.md](docs/SECURITY.md) | Sicherheitskonzept, DSGVO, Verschlüsselung, Auth |
| [docs/API.md](docs/API.md) | REST-API, OpenAPI/Swagger, Webhooks |
| [docs/DEVELOPER_GUIDE.md](docs/DEVELOPER_GUIDE.md) | Entwickler-Guide, Plugin-System, Projektstruktur |
| [docs/USER_GUIDE.md](docs/USER_GUIDE.md) | Benutzerhandbuch |
| [docs/STATUS.md](docs/STATUS.md) | Umsetzungsstatus je Anforderung, Roadmap |

## Schnellstart: Deployment (Docker / Portainer)

Kein manuelles Setup nötig - Datenbank-Migrationen, Sicherheits-Secrets und
automatische Backups sind bereits eingerichtet. `docker-compose.yml` nutzt fertige,
von GitHub Actions gebaute Images statt lokal zu bauen:

```bash
docker compose up -d
```

Läuft danach unter `http://localhost:8080` (Port über `FRONTEND_PORT` änderbar). Als
Portainer-Stack: Inhalt von `docker-compose.yml` im "Web editor" einfügen, "Deploy the
stack" klicken (die GHCR-Pakete müssen dafür einmalig auf "Public" gestellt sein).
Danach auf `/register` die erste Firma/den ersten Admin-Account anlegen.
Details und empfohlene Anpassungen für einen öffentlichen Server:
[docs/INSTALL.md](docs/INSTALL.md), Abschnitt 1.

## Schnellstart (lokale Entwicklung ohne Docker)

Voraussetzung: [Node.js](https://nodejs.org) ≥ 20 LTS sowie eine lokal erreichbare
PostgreSQL-Instanz (am einfachsten via `docker compose up -d db`, siehe
[docs/INSTALL.md](docs/INSTALL.md), Abschnitt 2).

```bash
# Backend
cd backend
cp .env.example .env      # unter Windows: copy .env.example .env
npm install
npm run prisma:generate
npm run prisma:migrate
npm run seed               # optional: Demo-Firma/Kunden/Produkte
npm run dev                 # läuft auf http://localhost:4000

# Frontend (zweites Terminal)
cd frontend
npm install
npm run dev                 # läuft auf http://localhost:5173
```

API-Dokumentation (Swagger UI): http://localhost:4000/api/docs

Demo-Login nach `npm run seed`: `admin@musterhausen-3d.de` / `Demo1234!`

## Projektstruktur

```
backend/            Node.js/Express/TypeScript-API, Prisma-Datenmodell, PDF-Generator
  src/modules/       Fachliche Module (auth, customers, invoices, pdf, backup, plugins, ...)
  prisma/            Datenbankschema & Migrationen
  plugins/           Beispiel-Plugin, Ablageort für eigene Erweiterungen
frontend/           React/TypeScript/Vite/Tailwind-SPA
docs/               Vollständige Dokumentation
docker-compose.yml  Produktionsnahes Setup mit PostgreSQL
```

## Kernfunktionen (Stand dieses Repos)

- Rechnungen, Angebote, Lieferscheine, Auftragsbestätigungen inkl. PDF-Export mit SEPA-QR-Code
- Automatische, lückenlose Belegnummerierung je Firma/Jahr
- Steuerlogik inkl. Kleinunternehmerregelung (§19 UStG)
- Kundenverwaltung mit Beleghistorie, DSGVO-Auskunft & -Löschung
- Produkt-/Leistungsverzeichnis
- Mandantenfähigkeit (mehrere Firmen), Rollen (Admin/Mitarbeiter/Buchhaltung)
- Argon2id-Passwort-Hashing, JWT-Access-/Refresh-Tokens mit Rotation, optionale 2FA (TOTP)
- Audit-Log für alle schreibenden Aktionen
- CSV/JSON-Export und -Import
- Automatisierte Backups (ZIP mit Datenbank-Dump + Uploads, laufen im Hintergrund ohne
  externen Cron; optional S3-kompatibler Cloud-Upload)
- Plugin-/Hook-System und signierte Webhooks
- REST-API mit OpenAPI/Swagger-Dokumentation
- React-Frontend mit Dunkelmodus, Mehrsprachigkeit (DE/EN), Fuzzy-Suche
- E-Mail-Versand mit eigenen SMTP-Zugangsdaten je Firma (Rechnungen, Zahlungserinnerungen), PDF-Download immer als Fallback
- Kleinunternehmer-Schwellenwert-Warner und Pflichtangaben-Hinweise
- Einnahmen-Überschuss-Rechnung (EÜR) mit Ausgabenerfassung und CSV-Export für den Steuerberater
- Bankabgleich per Kontoauszugs-CSV-Import mit automatischem Zahlungsabgleich

Siehe [docs/STATUS.md](docs/STATUS.md) für eine ehrliche Übersicht, welche Anforderungen
vollständig, teilweise oder als Architektur-Hook (Erweiterungspunkt für später) umgesetzt sind.

## Lizenz / Betrieb

Lizenziert unter der [MIT-Lizenz](LICENSE) - freie Nutzung, Veränderung und Weitergabe,
auch kommerziell, ohne Gewährleistung (siehe Lizenztext).

Diese Software wird als Ausgangsbasis für den Eigenbetrieb bereitgestellt. Vor einem
öffentlich erreichbaren Produktivbetrieb: eigene Secrets/Passwörter statt der
Standardwerte setzen (siehe `.env.example` und [docs/INSTALL.md](docs/INSTALL.md),
Abschnitt 1d), TLS-Terminierung via Reverse-Proxy einrichten, ein Backup einmal testen
und die Hinweise in [docs/SECURITY.md](docs/SECURITY.md) prüfen.
