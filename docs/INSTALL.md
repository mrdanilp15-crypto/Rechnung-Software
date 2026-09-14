# Installation & Betrieb

Es gibt zwei Wege, die Software zu betreiben:

- **Docker Compose / Portainer** (empfohlen für den echten Betrieb) - Abschnitt 1.
  Datenbank, Migrationen, Sicherheits-Secrets und automatische Backups sind bereits
  vollständig eingerichtet, es ist keine weitere Konfiguration nötig.
- **Lokal ohne Docker** (für Entwicklung/Beitragen am Code) - Abschnitt 2.

## 1. Deployment mit Docker Compose / Portainer

`docker-compose.yml` nutzt fertige, von GitHub Actions gebaute Images
(`ghcr.io/mrdanilp15-crypto/rechnung-software-backend`/`-frontend`) statt lokal aus
Quellcode zu bauen. Portainer muss dafür also **nicht** den Quellcode auschecken -
einfach den Inhalt der Datei einfügen, fertig. Die Images werden bei jedem Push auf
`main` automatisch aktualisiert (siehe `.github/workflows/docker-image.yml`).

**Einmalig wichtig**: Nach dem ersten erfolgreichen GitHub-Actions-Lauf müssen die
beiden GHCR-Pakete auf "Public" gestellt werden, sonst kann Portainer sie ohne
Registry-Login nicht herunterladen: GitHub-Profil → **Packages** → jeweiliges Paket
(`rechnung-software-backend`, `rechnung-software-frontend`) → **Package settings** →
**Change visibility** → **Public**.

### 1a. Als Portainer-Stack (Web Editor - empfohlen, kein Repository-Zugriff nötig)

1. Dieses Repository auf GitHub veröffentlichen bzw. Änderungen dorthin pushen -
   GitHub Actions baut daraufhin automatisch die Images (Fortschritt im
   "Actions"-Tab des Repos einsehbar).
2. Die beiden GHCR-Pakete wie oben beschrieben einmalig auf "Public" stellen.
3. In Portainer: **Stacks → Add stack → Web editor**.
4. Inhalt von `docker-compose.yml` einfügen.
5. Optional unter **Environment variables** eigene Werte setzen (siehe `.env.example`
   im Repo-Wurzelverzeichnis für die vollständige Liste - alles ist optional, siehe
   Abschnitt 1c). Ohne jede Angabe ist die Instanz trotzdem sofort einsatzbereit.
6. **Deploy the stack** klicken.
7. Nach wenigen Sekunden (Images werden gepullt, automatische Migrationen laufen) ist
   die Anwendung unter `http://<server>:8080` erreichbar (Port über `FRONTEND_PORT`
   änderbar).
8. Auf `/register` die erste Firma und den ersten Admin-Account anlegen - fertig.

Alternativ **Stacks → Add stack → Repository** (Portainer klont dann das Repo selbst) -
funktioniert genauso, ist aber nicht nötig, da die Images ohnehin fertig aus der
Registry kommen.

### 1b. Lokal mit Docker Compose (z.B. zum Ausprobieren)

```bash
docker compose up -d
```

Läuft dann unter `http://localhost:8080`. Zum Anpassen der Umgebungsvariablen die
Datei `.env.example` im Projekt-Wurzelverzeichnis nach `.env` kopieren und Werte
eintragen (wird von `docker compose` automatisch eingelesen).

Zum lokalen Bauen aus dem eigenen Quellcode statt der GHCR-Images (z.B. um eine noch
nicht gepushte Änderung zu testen): in einer lokalen Kopie von `docker-compose.yml`
bei `backend`/`frontend` zusätzlich `build: ./backend` bzw. `build: ./frontend`
ergänzen und `docker compose up -d --build` verwenden.

### 1c. Was passiert beim ersten Start automatisch?

- **Datenbank-Migrationen**: Der Backend-Container wartet auf PostgreSQL und wendet
  alle Prisma-Migrationen automatisch an (`backend/docker-entrypoint.sh`). Bei
  zukünftigen Updates (neues Image, `docker compose up -d --build`) geschieht das
  automatisch erneut - keine manuelle Migration nötig.
- **Sicherheits-Secrets**: Werden `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` und
  `FIELD_ENCRYPTION_KEY` nicht explizit gesetzt, erzeugt der Container beim
  allerersten Start zufällige, kryptographisch starke Werte und speichert sie
  dauerhaft im `backend_data`-Volume. Sie bleiben über Neustarts/Updates stabil,
  solange das Volume nicht gelöscht wird.
- **Erste Firma/erster Benutzer**: Kein Setup-Skript nötig - einfach auf `/register`
  die erste Firma anlegen. Das legt automatisch einen Admin-Benutzer für diese Firma
  an. Wer die Instanz nicht öffentlich für beliebige Registrierungen anbieten möchte,
  sollte den Server nach dem Anlegen des eigenen Admin-Accounts nicht mehr ungeschützt
  ins Internet stellen bzw. den Zugriff auf `/register` per Reverse-Proxy einschränken.
- **Automatische Backups**: Laufen alle `BACKUP_INTERVAL_HOURS` Stunden (Standard: 24)
  im Hintergrund und landen im `backend_backups`-Volume (ZIP mit PostgreSQL-Dump +
  Uploads). Abschnitt 4 beschreibt, wie man an diese Dateien herankommt.

### 1d. Empfohlene Anpassungen für einen öffentlich erreichbaren Server

Alles unten ist optional (ohne Angabe werden funktionierende Standard-/generierte
Werte verwendet) - für einen aus dem Internet erreichbaren Server aber empfehlenswert,
als Portainer-Stack-Umgebungsvariablen gesetzt:

| Variable | Zweck |
|---|---|
| `POSTGRES_PASSWORD` | Eigenes Datenbank-Passwort statt Standardwert |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `FIELD_ENCRYPTION_KEY` | Eigene Secrets statt automatisch generierter (z.B. `openssl rand -base64 48`) |
| `PUBLIC_APP_URL`, `CORS_ORIGINS` | Eigene Domain, z.B. `https://rechnung.meine-firma.de` |
| `FRONTEND_PORT` | Anderer Host-Port statt 8080 |

TLS/HTTPS terminiert diese Software selbst nicht - dafür einen Reverse-Proxy mit
eigenem Zertifikat vorschalten (z.B. [nginx Proxy Manager](https://nginxproxymanager.com/)
oder [Traefik](https://traefik.io/), beide laufen gut neben Portainer). Der Reverse-Proxy
leitet einfach an `http://<server>:8080` (bzw. den gewählten `FRONTEND_PORT`) weiter.

## 2. Lokale Entwicklung ohne Docker

Für Docker/Portainer-Betrieb (Abschnitt 1) ist dieser Abschnitt nicht nötig.

### 2a. Voraussetzungen

- [Node.js 20 LTS](https://nodejs.org)
- Eine lokal erreichbare PostgreSQL-Instanz. Am einfachsten dafür nur die Datenbank
  aus der Compose-Datei starten:
  ```bash
  docker compose up -d db
  ```
  Läuft dann unter `localhost:5432` mit den Zugangsdaten aus `docker-compose.yml`
  (Standard: `rechnung` / `rechnung`, Datenbank `rechnung`).

### 2b. Backend

```bash
cd backend
copy .env.example .env    # PowerShell: Copy-Item .env.example .env
```

`.env` öffnen, `DATABASE_URL` auf die lokale PostgreSQL-Instanz zeigen lassen und
`JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET`/`FIELD_ENCRYPTION_KEY` auf eigene Zufallswerte
setzen (z.B. mit PowerShell: `[Convert]::ToBase64String((1..48 | ForEach-Object { Get-Random -Maximum 256 }))`).

```bash
npm install
npm run prisma:generate
npm run prisma:migrate      # wendet die Migrationen aus prisma/migrations an
npm run seed                # optional: Demo-Firma "Musterhausen 3D-Druck GmbH" anlegen
npm run dev
```

Das Backend läuft auf `http://localhost:4000`. Gesundheitscheck: `GET /health`.
API-Dokumentation: `http://localhost:4000/api/docs`.

### 2c. Frontend

```bash
cd frontend
npm install
npm run dev
```

Läuft auf `http://localhost:5173` und proxyt `/api`-Anfragen automatisch zum Backend
(siehe `vite.config.ts`).

## 3. Backups im Detail

Automatische Backups laufen bereits im Hintergrund (siehe 1c) - zusätzlich manuell
auslösbar über Einstellungen → Daten → "Backup jetzt erstellen" (Admin) oder
`POST /api/backups/run`.

An die ZIP-Dateien kommt man je nach Betriebsart heran:

- **Docker/Portainer**: Volume `backend_backups` (in Portainer unter "Volumes"
  einsehbar, oder `docker cp <backend-container>:/app/backups ./lokaler-ordner`).
- **Lokal ohne Docker**: `backend/backups/`.

Jedes Backup enthält einen vollständigen PostgreSQL-Dump (`database.sql`, per
`pg_dump`) sowie alle Uploads (Logo, Stempel, Unterschrift). Wiederherstellen:

```bash
psql "$DATABASE_URL" < database.sql
```

Optional zusätzlich in S3-kompatiblen Speicher hochladen: `S3_*`-Variablen setzen
(siehe `.env.example`).

## 4. Neue Firma / neuen Benutzer / Kundendaten importieren

- Neue Firma: Registrierung über `/register` im Frontend (legt automatisch einen
  Admin-Benutzer an).
- Weitere Benutzer für dieselbe Firma: Einstellungen → Benutzer (als Admin).
- Bestehende Kundendaten importieren: Einstellungen → Daten → "Kunden importieren"
  (Frontend) bzw. `POST /api/import/customers` mit einer CSV-Datei (Spalten: `name,
  email,phone,street,postalCode,city,country`).
