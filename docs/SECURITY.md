# Sicherheitskonzept

## Passwörter

- Hashing mit **Argon2id** (`backend/src/modules/auth/password.ts`), Parameter an die
  OWASP-Empfehlung 2026 angelehnt (19 MiB Speicher, 2 Iterationen).
- Mindestanforderung: 10 Zeichen, Buchstaben und Ziffern (`isPasswordStrongEnough`).
- Fehlgeschlagene Logins werden gezählt; nach 5 Fehlversuchen wird das Konto 15 Minuten
  gesperrt (`account lockout`, siehe `modules/auth/router.ts`).

## Sitzungen (JWT)

- **Access-Token**: JWT, 15 Minuten Gültigkeit, signiert mit `JWT_ACCESS_SECRET`.
  Enthält `sub` (User-ID), `companyId`, `role`, `email` - genug für Autorisierung ohne
  DB-Zugriff bei jeder Anfrage.
- **Refresh-Token**: zufälliger 48-Byte-String (kein JWT). In der Datenbank wird **nur
  der SHA-256-Hash** gespeichert (`RefreshToken.tokenHash`) - ein Datenbank-Leak allein
  gibt keine gültigen Tokens preis. Rotierend: Jede Nutzung erzeugt ein neues Token und
  widerruft das alte (`rotateRefreshToken`), Wiederverwendung eines bereits
  ausgetauschten Tokens ist daher erkennbar/unterbindbar.
- Access- und Refresh-Token werden dem Browser als **httpOnly-, Secure- (Produktion)
  und SameSite=strict-Cookies** gesetzt (`modules/auth/cookies.ts`) - für JavaScript im
  Frontend grundsätzlich unsichtbar, ein XSS-Angriff könnte sie also nicht direkt
  auslesen (anders als die frühere `localStorage`-Speicherung). Funktioniert ohne
  Cross-Origin-Sonderfälle, weil sowohl in Produktion (nginx) als auch lokal
  (Vite-Dev-Proxy, `vite.config.ts`) die API aus Browsersicht immer unter demselben
  Origin wie das Frontend erreichbar ist. Der Refresh-Token-Cookie ist zusätzlich auf
  den Pfad `/api/auth` beschränkt, damit er nicht bei jeder beliebigen Anfrage
  mitgeschickt wird. Die Tokens werden zusätzlich weiterhin im JSON-Response-Body
  zurückgegeben, damit nicht-browserbasierte Aufrufer (Skripte, `Authorization: Bearer`,
  siehe [API.md](API.md)) die API unverändert nutzen können - `middleware/auth.ts`
  akzeptiert beide Wege.

## Zwei-Faktor-Authentifizierung (2FA/TOTP)

- Optional pro Benutzer aktivierbar (`/api/auth/2fa/setup`, `/confirm`, `/disable`).
- TOTP-Secret wird **AES-256-GCM-verschlüsselt** in der Datenbank abgelegt
  (`utils/crypto.ts`, Schlüssel aus `FIELD_ENCRYPTION_KEY`), nicht im Klartext.
- Kompatibel mit Standard-Authenticator-Apps (Google/Microsoft Authenticator, Authy)
  über den `otplib`-Standard (RFC 6238).

## Rollen & Rechte (RBAC)

Drei Rollen: `ADMIN`, `MITARBEITER`, `BUCHHALTUNG`. Durchsetzung über
`middleware/auth.ts` (`requireRole(...)`). Beispiele:
- Benutzerverwaltung, Firmenstammdaten, Webhooks, Backups: nur `ADMIN`.
- Rechnung als bezahlt markieren/stornieren: `ADMIN` oder `BUCHHALTUNG`.
- Rechnungen/Kunden/Produkte anlegen: alle authentifizierten Rollen.

## Audit-Log

Jede schreibende Aktion (Anlegen, Ändern, Statuswechsel, Login, 2FA-Änderung, DSGVO-
Auskunft/-Löschung, Backup-Erstellung) wird in `AuditLog` protokolliert:
Zeitstempel, handelnder Benutzer, IP-Adresse, betroffene Entität, sowie ein JSON-Diff
in `metadata` (ohne Klartext-Passwörter/-Secrets - siehe Redaction in `utils/logger.ts`
und die bewusste Auswahl der geloggten Felder in den jeweiligen Routern). Einträge
werden nie verändert oder gelöscht (kein UPDATE/DELETE-Endpunkt für `AuditLog`).
Einsehbar für Admins über `GET /api/audit-logs` bzw. die Seite "Audit-Log" im Frontend
(`pages/AuditLog.tsx`) - vorher wurde zwar protokolliert, es gab aber keine Möglichkeit,
die Einträge tatsächlich einzusehen.

## Verschlüsselung ruhender Daten

- **AES-256-GCM** für hochsensible Einzelfelder (TOTP-Secrets, SMTP-Passwort) via
  `utils/crypto.ts`. GCM liefert Authentizität (Auth-Tag) zusätzlich zur Vertraulichkeit.
- Backup-Archive werden mit demselben Schlüssel/Verfahren ganzheitlich verschlüsselt
  (`utils/fileCrypto.ts`, `BACKUP_ENCRYPTION_ENABLED`, Standard: an) - siehe Abschnitt
  "Backup & Wiederherstellung" unten.
- Die Datenbank selbst (PostgreSQL-Datenverzeichnis) liegt **nicht** automatisch
  verschlüsselt auf der Festplatte. Für Volltextverschlüsselung: Windows BitLocker
  bzw. LUKS auf dem Server-Volume aktivieren, oder PostgreSQL mit
  `pgcrypto`/Transparent Data Encryption des Hosting-Anbieters betreiben.

## Backup & Wiederherstellung

- Automatisiertes Backup (`BACKUP_INTERVAL_HOURS`, Standard: alle 24h) und manuell über
  "Backup jetzt erstellen" (Einstellungen) bzw. `npm run backup`: vollständiger
  PostgreSQL-Dump (`pg_dump --clean --if-exists`, macht den Dump selbst restaurierbar
  über eine bereits bestehende Datenbank hinweg) plus alle Uploads (Logos, Stempel,
  Unterschrift), gepackt als ZIP.
- **Aufbewahrung 10 Jahre** (`BACKUP_RETENTION_DAYS`, Standard: 3650) statt vorher 30
  Tage - ein Backup ist zwar primär eine Katastrophen-Sicherung und kein Ersatz für die
  eigentliche GoBD-Aufbewahrungspflicht (die die Live-Datenbank erfüllt, solange nichts
  gelöscht wird), sollte als letzte Verteidigungslinie gegen einen Totalverlust der
  Datenbank aber selbst genauso lange vorgehalten werden.
- **Verschlüsselung**: Jedes Backup-ZIP wird standardmäßig mit AES-256-GCM verschlüsselt
  (`.zip.enc`, `BACKUP_ENCRYPTION_ENABLED=false` zum Deaktivieren) - relevant vor allem
  für das optionale S3-Ziel, das außerhalb der eigenen Infrastruktur liegen kann.
- **Wiederherstellung**: `npm run restore -- <Pfad-zum-Backup> --yes` im Container
  (Portainer-Terminal des Backend-Dienstes) entschlüsselt, entpackt und spielt Dump +
  Uploads zurück (`scripts/restoreBackup.ts`). Ohne `--yes` bricht das Skript mit einer
  Warnung ab, da der Vorgang bestehende Daten überschreibt. Ein Restore, der nie
  getestet wurde, ist im Ernstfall keine verlässliche Absicherung - vor dem produktiven
  Einsatz einmal gegen eine Testdatenbank ausprobieren.

## Transport (HTTPS)

- Die Anwendung selbst terminiert kein TLS (Node/Express lauscht auf Klartext-HTTP).
  In Produktion **muss** ein Reverse-Proxy (nginx, Caddy, Traefik) mit gültigem
  TLS-Zertifikat (z.B. via Let's Encrypt) vorgeschaltet werden. `app.set("trust proxy", 1)`
  ist bereits gesetzt, `Strict-Transport-Security` wird in Produktion automatisch gesetzt.
- Siehe [INSTALL.md](INSTALL.md), Abschnitt "Produktivbetrieb", für eine Beispiel-
  nginx-Konfiguration.

## Rate-Limiting & Brute-Force-Schutz

- Allgemeines API-Limit: 100 Anfragen / 15 Minuten je IP (`RATE_LIMIT_*`-Variablen).
- Striktes Limit für `/api/auth/*`: 10 Anfragen / 15 Minuten je IP
  (`LOGIN_RATE_LIMIT_MAX`), zusätzlich zur Account-Lockout-Logik oben.
- Beide über `express-rate-limit` (`middleware/rateLimit.ts`), einfach erweiterbar auf
  einen verteilten Store (Redis) bei Mehrserverbetrieb.

## Eingabevalidierung

Alle API-Eingaben werden mit [Zod](https://zod.dev)-Schemas validiert
(`z.object(...).parse(req.body)`); ungültige Eingaben führen zu HTTP 400 mit
Detailinformationen, nie zu unbehandelten Exceptions. SQL-Injection ist durch die
ausschließliche Nutzung von Prisma (parametrisierte Queries, kein Roh-SQL) strukturell
ausgeschlossen.

## DSGVO-Konformität

- **Auskunftsrecht (Art. 15 DSGVO)**: `GET /api/customers/:id/gdpr-export` liefert alle
  gespeicherten personenbezogenen Daten eines Kunden inkl. Belegen als JSON (Button
  "DSGVO-Export" auf der Kundendetailseite). Für den eigenen Benutzer-Account gibt es
  zusätzlich `GET /api/auth/me/export` (Kontodaten + eigenes Aktivitätsprotokoll, Button
  "Eigene Daten exportieren" unter Einstellungen → Passwort).
- **Recht auf Löschung (Art. 17 DSGVO)**: `POST /api/customers/:id/gdpr-erase`
  anonymisiert personenbezogene Felder (Name, E-Mail, Telefon, Adresse, Notizen).
  Rechnungsbelege selbst werden **nicht** hart gelöscht, da hierfür die steuerrechtliche
  Aufbewahrungspflicht (§147 Abgabenordnung, i.d.R. 10 Jahre) vorrangig ist - dieser
  Zielkonflikt zwischen Löschrecht und Aufbewahrungspflicht ist in der DSGVO selbst
  vorgesehen (Art. 17 Abs. 3 lit. b DSGVO).
- **Datenminimierung**: Es werden nur Felder erhoben, die für die Rechnungsstellung
  nach § 14 UStG erforderlich sind oder vom Nutzer freiwillig ergänzt werden (Notizen).
- **Auftragsverarbeitung**: Wird ein S3-kompatibler Cloud-Speicher für Backups genutzt
  (`.env`: `S3_*`), ist mit dem jeweiligen Anbieter ein Auftragsverarbeitungsvertrag
  (AVV) nach Art. 28 DSGVO abzuschließen - dies kann Software nicht automatisieren.

## Container-Härtung

- Der Backend-Container startet zwar (Docker-Standard) als `root`, der Entrypoint
  repariert damit einmalig die Besitzrechte etwaiger noch root-owned Alt-Volumes und
  wechselt danach über `su-exec` dauerhaft zum nicht-root-Benutzer `node`, **bevor** der
  eigentliche Server-Prozess startet (`docker-entrypoint.sh`) - der laufende Node-Prozess
  besitzt also keine root-Rechte im Container.

## Bekannte Grenzen (transparent, kein "false sense of security")

- Mandantentrennung erfolgt auf Anwendungsebene (jede Query filtert nach `companyId`),
  **nicht** zusätzlich über PostgreSQL Row-Level-Security. Ein Programmierfehler in
  einem neuen Endpunkt könnte diese Trennung theoretisch verletzen - Code-Reviews und
  die mitgelieferten Tests (`backend/tests`) adressieren dies, ersetzen aber keine
  unabhängige Sicherheitsprüfung vor produktivem Einsatz mit echten Kundendaten.
- Kein automatisiertes Dependency-Scanning (z.B. `npm audit` / Dependabot) ist in
  diesem Repository als CI-Pipeline eingerichtet - für Produktivbetrieb empfohlen.
- Digitale Signaturen für PDFs (qualifizierte elektronische Signatur nach eIDAS) sind
  **nicht** implementiert (siehe [STATUS.md](STATUS.md)) - für die meisten
  Kleingewerbe-Rechnungen gesetzlich nicht erforderlich, für andere Belegarten ggf. schon.
