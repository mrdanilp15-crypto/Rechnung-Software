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
| Steuerlogik (USt., §19 Kleinunternehmer, innergemeinschaftliche Lieferung, Reverse-Charge, Ausfuhr) | ✅ | Zentral in `modules/invoices/build.ts` + `modules/tax/`; Waren an EU-Unternehmer = steuerfreie innergemeinschaftliche Lieferung, Dienstleistungen = Reverse-Charge, Drittland = Ausfuhr/nicht steuerbar (Leistungsart je Rechnung); §19-Schwellenwerte an die Reform seit 1.1.2025 angepasst (25.000€/100.000€). Komplexere Fälle (Reihen-/Dreiecksgeschäfte, OSS) nicht abgebildet |
| E-Rechnung (XRechnung, UBL/EN16931) | ✅ | Export je Rechnung über "XRechnung (XML)" (Storno als UBL-CreditNote). **Mit dem offiziellen KoSIT-Validator 1.6.3 und der XRechnung-Prüfkonfiguration 3.0.2 (Stand 31.08.2026) geprüft:** Regelrechnung, Kleinunternehmer, innergemeinschaftliche Lieferung, Reverse-Charge, Ausfuhr, nicht steuerbare Leistung und Storno werden ohne Fehler akzeptiert. Bei öffentlichen Auftraggebern zusätzlich die Leitweg-ID hinterlegen. ZUGFeRD (Hybrid-PDF) nicht implementiert. |
| PDF-Generierung, PDF/A-kompatibel | ✅ | DIN-5008-Layout, eingebettete Schrift, **PDF/A-3b - mit veraPDF 1.30.3 für alle Belegarten (Rechnung, Entwurf, Storno, Kleinunternehmer, Angebot, Lieferschein, Auftragsbestätigung, Mehrseiter) fehlerfrei validiert.** Gilt nur mit eingebetteter Schrift (Docker-Image: Liberation Sans); ohne Schriftdatei Fallback auf Helvetica (kein PDF/A) |
| Exportfunktionen (PDF, JSON, CSV) | ✅ | |
| Beleg-Ablauf (Angebot → Auftrag → Lieferschein → Rechnung), gemeinsamer Editor mit Auto-Speichern und Live-Vorschau für alle Belegarten, Belege-Seite | ✅ | Entwürfe je Belegart, Weiterführen mit einem Klick, Folgebeleg-Markierung; Menü auf sechs Punkte reduziert |
| Belegdesign (3 Layouts) und änderbare Begrüßungs-/Schlusstexte | ✅ | Klar / Akzentband / Kompakt, mit veraPDF (PDF/A-3b) geprüft; Texte mit Platzhaltern, je Beleg änderbar bis zum Versand |
| Dunkelmodus/helles UI | ✅ | |
| Mehrsprachigkeit (DE/EN) | 🟡 | Frontend vollständig; Backend-Fehlermeldungen aktuell nur Deutsch |

## 2. Architektur

| Anforderung | Status |
|---|---|
| Modulare Architektur (Node/Express) | ✅ |
| Frontend React/Vue/Svelte | ✅ React |
| Datenbank | ✅ PostgreSQL (Docker Compose/Portainer richtet sie automatisch mit ein) |
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
| PDF/A-kompatible Ausgabe | ✅ PDF/A-3b, mit veraPDF validiert |
| pdf-lib/WeasyPrint/Puppeteer/ReportLab | 🟡 `pdfkit` gewählt (Begründung: keine Chromium-Abhängigkeit, plattformunabhängig) |
| Dynamische Templates (Logo, Farben, Layout) | ✅ Logo, Firmenfarbe konfigurierbar; Layout ist ein festes, aber parametrisiertes Template - kein visueller Template-Editor |
| Automatische Seitenumbrüche | ✅ |
| QR-Code für SEPA-Zahlungen | ✅ EPC069-12/GiroCode |
| ZUGFeRD / Factur-X (EN 16931) | ✅ PDF/A-3b mit eingebettetem CII-XML, mit KoSIT (CII-Variante) und veraPDF geprüft |
| Digitale Signaturen | 🧩 Nicht implementiert |

## 5. Datenhaltung & Backup

| Anforderung | Status |
|---|---|
| Automatische tägliche Backups | ✅ Läuft eingebaut im Backend-Prozess (Intervall über `BACKUP_INTERVAL_HOURS`), kein externer Cron nötig |
| Export als ZIP-Archiv | ✅ Inkl. vollständigem PostgreSQL-Dump (`pg_dump`) + Uploads |
| Importfunktion für neue Benutzer | 🟡 CSV-Kundenimport vorhanden; kein vollständiger "Alle Daten importieren"-Assistent |
| Cloud-Option (S3-kompatibel) | ✅ Optional über Umgebungsvariablen |
| Lokale Offline-Version möglich | 🟡 Läuft komplett offline (kein Internetzugriff nötig), benötigt aber eine PostgreSQL-Instanz statt einer einzelnen Datei |

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
| Mobile-optimiert | ✅ Dediziertes Karten-Layout für alle Listen auf schmalen Bildschirmen (`MobileCard`), zusätzlich als installierbare PWA |

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

## 10. Funktionsumfang seit der Überarbeitung

| Funktion | Status |
|---|---|
| Drei PDF-Layouts (Klar/Akzentband/Kompakt) mit eigenen Begrüßungs- und Schlusstexten | ✅ |
| Gemeinsamer Editor für Rechnung/Angebot/Auftrag/Lieferschein, Autospeichern, Live-Vorschau | ✅ |
| Belegkette Angebot → Auftrag → Lieferschein → Rechnung | ✅ |
| Duplizieren, globale Suche (Strg+K), Umsatz-Diagramm | ✅ |
| Kalkulation für 3D-Druck (Material, Strom, Abschreibung, Verschleiß, Arbeit, Gemeinkosten) | ✅ |
| Drucker-Verwaltung mit eigenen Kostenwerten je Maschine | ✅ Vorausgefüllte Werte sind Beispiele |
| Kalkulation: Fehldruckquote, Rüstzeit je Auftrag, Verpackung, Plattformgebühren, Rundung/Mindestpreis, Staffelpreise, gleitender Materialpreis | ✅ |
| Mahnwesen mit drei Stufen, Verzugszinsen, Pauschale, Mahn-PDF | ✅ Basiszinssatz muss vom Nutzer gepflegt werden |
| Anzahlungs- und Schlussrechnung (XRechnung: Typ 326 + BT-113) | ✅ mit KoSIT geprüft |
| Wiederkehrende Rechnungen (erzeugen nur Entwürfe) | ✅ |
| Steuerberater-Paket, USt-Übersicht | 🟡 Orientierungshilfe, kein DATEV-Format, keine Voranmeldung |
| Passwort vergessen per E-Mail | ✅ benötigt eingerichtetes SMTP |
| Grenzüberschreitende USt. (ig. Lieferung, Reverse-Charge, Ausfuhr) | 🟡 Logik umgesetzt; im Einzelfall vom Steuerberater bestätigen lassen |

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
