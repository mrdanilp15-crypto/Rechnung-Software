FROM node:20-alpine AS build
WORKDIR /app
# Prismas Query-Engine für Alpine (musl) linkt gegen libssl - node:20-alpine basiert auf
# einer Alpine-Version mit OpenSSL 3.0, die aber nicht immer bereits vorinstalliert ist.
# Ohne dieses Paket schlägt "prisma generate"/der Serverstart mit einem
# "libssl.so.3: cannot open shared object file"-Fehler fehl.
RUN apk add --no-cache openssl
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run prisma:generate
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
# openssl: siehe Kommentar oben (auch zur Laufzeit nötig, nicht nur beim Build).
# postgresql-client liefert pg_dump/psql für Backup & Restore (siehe
# src/modules/backup/runBackup.ts, scripts/restoreBackup.ts); unzip wird für Restore
# gebraucht; dumb-init sorgt dafür, dass SIGTERM (Docker stop/restart) korrekt beim
# Node-Prozess ankommt statt beim Shell-Entrypoint zu enden; su-exec lässt den
# Entrypoint kurz als root Verzeichnisrechte reparieren und danach als nicht-root-
# Benutzer "node" in den eigentlichen Server wechseln (siehe docker-entrypoint.sh).
RUN apk add --no-cache openssl postgresql-client unzip dumb-init su-exec
COPY package*.json ./
RUN npm install --omit=dev
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY docker-entrypoint.sh ./
RUN chmod +x ./docker-entrypoint.sh && mkdir -p /app/data /app/uploads /app/backups && chown -R node:node /app
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:4000/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"
# Bewusst KEIN "USER node" hier: der Entrypoint startet als root (Standard-Verhalten),
# repariert damit einmalig die Besitzrechte etwaiger schon bestehender Volumes (die aus
# einer früheren Version dieses Images noch root-owned sein können) und wechselt danach
# selbst über su-exec dauerhaft zum nicht-root-Benutzer "node", BEVOR der eigentliche
# Node-Server startet - siehe docker-entrypoint.sh.
ENTRYPOINT ["dumb-init", "--"]
CMD ["./docker-entrypoint.sh"]
