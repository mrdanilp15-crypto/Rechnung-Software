#!/bin/sh
# Startet beim Hochfahren des Containers:
#   1. erzeugt fehlende Secrets einmalig und hält sie über Neustarts hinweg stabil
#   2. wartet auf die Datenbank und wendet alle offenen Prisma-Migrationen an
#   3. wechselt vom (Standard-)root-Benutzer dauerhaft zum nicht-root-Benutzer "node"
#      und startet erst dann den eigentlichen Server (Sicherheits-Härtung: der
#      laufende Node-Prozess besitzt danach keine root-Rechte mehr im Container)
# So funktioniert "Compose hochladen und starten" in Portainer ohne dass irgendein
# manueller Migrations- oder Konfigurationsschritt nötig ist.
set -e

DATA_DIR="/app/data"
SECRETS_FILE="$DATA_DIR/.generated-secrets.env"
mkdir -p "$DATA_DIR" /app/uploads /app/backups

# Volumes aus einer älteren Image-Version (vor Einführung des nicht-root-Benutzers)
# gehören noch root - hier einmalig korrigieren, damit der Server nach dem Wechsel zu
# "node" (siehe exec su-exec unten) weiterhin schreiben kann. Läuft bei jedem Start,
# ist bei bereits korrekten Rechten ein no-op.
chown -R node:node "$DATA_DIR" /app/uploads /app/backups

# Werden JWT_ACCESS_SECRET/JWT_REFRESH_SECRET/FIELD_ENCRYPTION_KEY nicht per Umgebungs-
# variable vorgegeben (z.B. weil in Portainer keine Environment-Variablen gesetzt wurden),
# erzeugen wir beim allerersten Start zufällige, kryptographisch starke Werte und legen
# sie im persistenten Volume ab. Sie MÜSSEN stabil bleiben - würden sie sich bei jedem
# Neustart ändern, würden alle bestehenden Logins ungültig und bereits verschlüsselt
# gespeicherte Felder (SMTP-Passwörter, 2FA-Secrets) unlesbar.
if [ ! -f "$SECRETS_FILE" ]; then
  echo "[entrypoint] Erzeuge persistente Secrets unter $SECRETS_FILE ..."
  {
    echo "GENERATED_JWT_ACCESS_SECRET=$(node -e 'process.stdout.write(require("crypto").randomBytes(48).toString("base64"))')"
    echo "GENERATED_JWT_REFRESH_SECRET=$(node -e 'process.stdout.write(require("crypto").randomBytes(48).toString("base64"))')"
    echo "GENERATED_FIELD_ENCRYPTION_KEY=$(node -e 'process.stdout.write(require("crypto").randomBytes(32).toString("base64"))')"
  } > "$SECRETS_FILE"
fi

# shellcheck disable=SC1090
set -a
. "$SECRETS_FILE"
set +a

export JWT_ACCESS_SECRET="${JWT_ACCESS_SECRET:-$GENERATED_JWT_ACCESS_SECRET}"
export JWT_REFRESH_SECRET="${JWT_REFRESH_SECRET:-$GENERATED_JWT_REFRESH_SECRET}"
export FIELD_ENCRYPTION_KEY="${FIELD_ENCRYPTION_KEY:-$GENERATED_FIELD_ENCRYPTION_KEY}"

echo "[entrypoint] Wende Datenbank-Migrationen an (mit Wiederholung, falls die Datenbank noch startet)..."
i=0
max_retries=30
until npx prisma migrate deploy; do
  i=$((i + 1))
  if [ "$i" -ge "$max_retries" ]; then
    echo "[entrypoint] Datenbank nach $max_retries Versuchen weiterhin nicht erreichbar - Abbruch."
    exit 1
  fi
  echo "[entrypoint] Migration fehlgeschlagen (Datenbank evtl. noch nicht bereit), Versuch $i/$max_retries, erneut in 2s..."
  sleep 2
done

echo "[entrypoint] Starte Server als nicht-root-Benutzer 'node'..."
exec su-exec node node dist/src/index.js
