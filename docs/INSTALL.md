# Installation & Betrieb

## 1. Voraussetzungen installieren (Windows 11)

Auf diesem Rechner ist aktuell **kein Node.js** installiert. So richten Sie es ein:

1. Node.js 20 LTS herunterladen: https://nodejs.org (Windows Installer, "LTS"-Version)
2. Installation ausführen (Standardoptionen reichen aus, npm ist enthalten)
3. Neues Terminal öffnen und prüfen:
   ```powershell
   node --version
   npm --version
   ```

Optional, aber empfohlen für Produktivbetrieb: [Git](https://git-scm.com/download/win)
für Versionskontrolle, [Docker Desktop](https://www.docker.com/products/docker-desktop/)
falls die Docker-Compose-Variante (Abschnitt 5) genutzt werden soll.

## 2. Backend einrichten

```powershell
cd backend
copy .env.example .env
```

`.env` öffnen und mindestens folgende Werte anpassen:

- `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`: je ein zufälliger String ≥ 32 Zeichen.
  Erzeugen z.B. mit PowerShell:
  ```powershell
  [Convert]::ToBase64String((1..48 | ForEach-Object { Get-Random -Maximum 256 }))
  ```
- `FIELD_ENCRYPTION_KEY`: 32-Byte-Base64-Wert, analog erzeugbar.

Danach:

```powershell
npm install
npm run prisma:generate
npm run prisma:migrate -- --name init
npm run seed        # optional: Demo-Firma "Musterhausen 3D-Druck GmbH" anlegen
npm run dev
```

Das Backend läuft auf `http://localhost:4000`. Gesundheitscheck: `GET /health`.
API-Dokumentation: `http://localhost:4000/api/docs`.

## 3. Frontend einrichten

```powershell
cd frontend
npm install
npm run dev
```

Läuft auf `http://localhost:5173` und proxyt `/api`-Anfragen automatisch zum Backend
(siehe `vite.config.ts`).

## 4. Umstieg von SQLite auf PostgreSQL (Mehrbenutzerbetrieb/Produktion)

SQLite eignet sich für Einzelplatz-/Kleinstbetrieb. Für echten Mehrbenutzerzugriff
über das Netzwerk wird PostgreSQL empfohlen:

1. PostgreSQL-Instanz bereitstellen (lokal, beim Hoster, oder via `docker-compose.yml`
   in diesem Repo, siehe Abschnitt 5).
2. In `backend/prisma/schema.prisma`:
   ```prisma
   datasource db {
     provider = "postgresql"
     url      = env("DATABASE_URL")
   }
   ```
3. `.env`: `DATABASE_URL="postgresql://user:password@host:5432/rechnung?schema=public"`
4. `npm run prisma:migrate -- --name init` erneut ausführen (erstellt das Schema in
   PostgreSQL).

## 5. Docker-Compose (produktionsnah, mit PostgreSQL)

```powershell
docker compose up -d --build
```

Startet PostgreSQL, Backend und Frontend gemäß `docker-compose.yml` im Projektwurzel-
verzeichnis. Vor dem ersten Start `.env`-Werte in `docker-compose.yml` bzw. einer
`.env`-Datei im Projektwurzelverzeichnis anpassen (siehe Kommentare dort).

## 6. Produktivbetrieb: HTTPS via Reverse-Proxy

Node/Express liefert nur Klartext-HTTP. Für Produktion einen Reverse-Proxy mit TLS
vorschalten, z.B. nginx:

```nginx
server {
    listen 443 ssl;
    server_name rechnung.beispiel.de;
    ssl_certificate     /etc/letsencrypt/live/rechnung.beispiel.de/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/rechnung.beispiel.de/privkey.pem;

    location /api/ {
        proxy_pass http://127.0.0.1:4000;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto https;
    }
    location / {
        root /var/www/rechnung-frontend/dist;   # `npm run build` im frontend/-Ordner
        try_files $uri /index.html;
    }
}
```

TLS-Zertifikat z.B. kostenlos über [Let's Encrypt](https://letsencrypt.org) (Certbot).

## 7. Backups automatisieren

Manuell: `npm run backup` im `backend`-Ordner (erzeugt ein ZIP in `backend/backups/`,
optional zusätzlich in S3-kompatiblen Speicher hochgeladen, siehe `.env`: `S3_*`).

**Windows Task Scheduler** (täglich 02:00 Uhr):

```powershell
schtasks /create /tn "RechnungBackup" /tr "npm run backup --prefix \"C:\Users\Daniel Hegemann\Documents\Rechnungs ersteller\backend\"" /sc daily /st 02:00
```

**Linux/Mac (Cron)**:

```cron
0 2 * * * cd /pfad/zu/backend && npm run backup >> /var/log/rechnung-backup.log 2>&1
```

Backups unter PostgreSQL: zusätzlich `pg_dump` in die Backup-Pipeline aufnehmen
(`runBackup.ts` sichert aktuell primär die SQLite-Datei + Uploads/PDFs - bei
PostgreSQL-Betrieb bitte `pg_dump $DATABASE_URL > dump.sql` ergänzen, siehe
Kommentar in `backend/src/modules/backup/runBackup.ts`).

## 8. Neue Firma / neuen Benutzer importieren

- Neue Firma: Registrierung über `/register` im Frontend (legt automatisch einen
  Admin-Benutzer an).
- Bestehende Kundendaten importieren: Einstellungen → "Kunden importieren" (Frontend)
  bzw. `POST /api/import/customers` mit einer CSV-Datei (Spalten: `name,email,phone,
  street,postalCode,city,country`).
