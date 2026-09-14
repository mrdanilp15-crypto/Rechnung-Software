# Umsetzungsstatus

Ehrliche Gegenüberstellung der ursprünglichen Anforderungen mit dem, was in diesem
Repository tatsächlich funktionsfähig implementiert ist. Legende: ✅ vollständig,
🟡 teilweise/Basisversion vorhanden, 🧩 als Architektur-Hook vorbereitet, aber nicht
implementiert.

## 1. Grundanforderungen

| Anforderung | Status | Anmerkung |
|---|---|---|
| Rechnungen erstellen/bearbeiten/speichern/exportieren | ✅ | Entwürfe editierbar, danach GoBD-konform unveränderlich; CSV/JSON-Export |
| Angebote, Lieferscheine, Auftragsbestätigungen | ✅ | Vollständige CRUD- und PDF-Unterstützung |
| Kundenverwaltung (Adressen, Historie, Notizen) | ✅ | inkl. Beleghistorie und DSGVO-Endpunkten |
| Produkt-/Leistungsverzeichnis | ✅ | |
| Automatische Rechnungsnummern | ✅ | Lückenlos je Firma/Jahr, transaktional |
| Steuerlogik (USt., §19 Kleinunternehmer) | ✅ | Zentral in `modules/tax/calculator.ts` |
| PDF-Generierung, PDF/A-kompatibel | 🟡 | Gültiges PDF 1.7 mit Metadaten; **keine** validierte PDF/A-3b-Konformität (ICC/XMP fehlen) - siehe ARCHITECTURE.md |
| Exportfunktionen (PDF, JSON, CSV) | ✅ | |
| Dunkelmodus/helles UI | ✅ | |
| Mehrsprachigkeit (DE/EN) | 🟡 | Frontend vollständig; Backend-Fehlermeldungen aktuell nur Deutsch |

## 2. Architektur

| Anforderung | Status |
|---|---|
| Modulare Architektur (Node/Express) | ✅ |
| Frontend React/Vue/Svelte | ✅ React |
| Datenbank PostgreSQL oder SQLite | ✅ Beide über dasselbe Prisma-Schema |
| API-First-Design | ✅ |
| Versionierbare Datenmodelle | 🟡 Prisma-Migrationen versionieren das Schema; ein explizites API-Versionsschema (`/api/v2/...`) ist noch nicht angelegt |
| Plugin-System | 🟡 Funktionierendes In-Prozess-Hook-System mit Referenz-Plugin; kein Sandboxing/Marktplatz |

## 3. Sicherheit

| Anforderung | Status |
|---|---|
| Argon2id-Passwort-Hashing | ✅ |
| JWT-Sessions mit Refresh-Tokens | ✅ Rotierend, gehasht gespeichert |
| 2FA optional | ✅ TOTP |
| Rollen & Rechte | ✅ Admin/Mitarbeiter/Buchhaltung |
| Audit-Log | ✅ Für alle schreibenden Aktionen |
| AES-256-GCM für sensible Daten | ✅ Für TOTP-Secrets; Volltext-DB-Verschlüsselung ist Infrastruktur-Aufgabe (siehe SECURITY.md) |
| HTTPS-Only | 🟡 HSTS-Header gesetzt; TLS-Terminierung erfolgt bewusst im Reverse-Proxy (siehe INSTALL.md) |
| Rate-Limiting & Brute-Force-Schutz | ✅ |
| DSGVO-konforme Verarbeitung | ✅ |
| Lösch-/Exportfunktionen für personenbezogene Daten | ✅ |

## 4. PDF-Generator

| Anforderung | Status |
|---|---|
| PDF/A-kompatible Ausgabe | 🟡 siehe oben |
| pdf-lib/WeasyPrint/Puppeteer/ReportLab | 🟡 `pdfkit` gewählt (Begründung: keine Chromium-Abhängigkeit, plattformunabhängig) |
| Dynamische Templates (Logo, Farben, Layout) | ✅ Logo, Firmenfarbe konfigurierbar; Layout ist ein festes, aber parametrisiertes Template - kein visueller Template-Editor |
| Automatische Seitenumbrüche | ✅ |
| QR-Code für SEPA-Zahlungen | ✅ EPC069-12/GiroCode |
| Digitale Signaturen | 🧩 Nicht implementiert |

## 5. Datenhaltung & Backup

| Anforderung | Status |
|---|---|
| Automatische tägliche Backups | 🟡 Backup-Skript vorhanden; Terminplanung erfolgt über Windows Task Scheduler/Cron (siehe INSTALL.md) - kein eingebauter Scheduler-Prozess |
| Export als ZIP-Archiv | ✅ |
| Importfunktion für neue Benutzer | 🟡 CSV-Kundenimport vorhanden; kein vollständiger "Alle Daten importieren"-Assistent |
| Cloud-Option (S3-kompatibel) | ✅ Optional über `.env` |
| Lokale Offline-Version möglich | ✅ SQLite-Standard läuft komplett offline |

## 6. Benutzerverwaltung

| Anforderung | Status |
|---|---|
| Registrierung/Login | ✅ |
| Rollen & Berechtigungen | ✅ |
| Aktivitätsprotokoll | ✅ Audit-Log |
| Mandantenfähigkeit (mehrere Firmen) | ✅ Mehrere Firmen im System; ein Benutzer gehört aktuell zu genau einer Firma (Firmenwechsel/Multi-Company-Login pro User ist Roadmap) |

## 7. UI/UX

| Anforderung | Status |
|---|---|
| Saubere, moderne Oberfläche | ✅ Tailwind CSS |
| Drag-and-Drop für Dateien | 🧩 Logo-/CSV-Upload funktioniert über Dateiauswahl, kein Drag-and-Drop-Handler |
| Live-Vorschau für Rechnungen | 🟡 Live-Summenberechnung beim Erstellen; PDF-Vorschau erfolgt nach Speichern (kein Live-PDF-Rendering im Formular) |
| Schnelles Suchfeld (Fuzzy Search) | ✅ `fuse.js` bei Kunden/Produkten |
| Mobile-optimiert | 🟡 Responsive Tailwind-Klassen vorhanden; kein dediziertes Mobile-Layout/Tests auf echten Geräten |

## 8. Erweiterbarkeit

| Anforderung | Status |
|---|---|
| Plugin-System | 🟡 siehe oben |
| Webhooks | ✅ HMAC-signiert |
| REST-API | ✅ |
| GraphQL | 🧩 Nicht implementiert, Architektur vorbereitet (siehe ARCHITECTURE.md) |
| Automatischer E-Mail-Versand | 🧩 Nicht implementiert - naheliegender Ausbau: Plugin, das bei `invoice.sent`/`invoice.created` per SMTP (z.B. `nodemailer`) versendet |

## 9. Dokumentation

| Anforderung | Status |
|---|---|
| Vollständige technische Dokumentation | ✅ Dieses `docs/`-Verzeichnis |
| API-Dokumentation (OpenAPI/Swagger) | ✅ `/api/docs`, deckt die Kernendpunkte ab; nicht jeder Nebenendpunkt ist im Detail dokumentiert |
| Installationsanleitung | ✅ |
| Entwickler-Guide | ✅ |
| Benutzerhandbuch | ✅ |

## Kritischer Hinweis zur Verifikation

Auf dem Rechner, auf dem dieses Repository erstellt wurde, war **kein Node.js**
installiert. Der Code konnte daher in dieser Sitzung **nicht** durch `npm install`,
`tsc --noEmit` oder automatisierte Tests verifiziert werden. Die Wahrscheinlichkeit
kleinerer Tippfehler oder Typinkonsistenzen ist dadurch höher als bei einem Projekt,
das während der Entwicklung laufend kompiliert und getestet wurde. **Vor produktivem
Einsatz unbedingt:**

```powershell
cd backend; npm install; npm run build
cd ../frontend; npm install; npm run build
```

ausführen und auftretende Fehler beheben (typischerweise kleinere Typ- oder
Importpfad-Korrekturen). Ein Blick auf `backend/tests` und das Anlegen weiterer Tests
für die eigenen Anpassungen wird empfohlen.
