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
# postgresql-client liefert pg_dump für die automatisierten Backups (siehe
# src/modules/backup/runBackup.ts); dumb-init sorgt dafür, dass SIGTERM (Docker
# stop/restart) korrekt beim Node-Prozess ankommt statt beim Shell-Entrypoint zu enden.
RUN apk add --no-cache openssl postgresql-client dumb-init
COPY package*.json ./
RUN npm install --omit=dev
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY docker-entrypoint.sh ./
RUN chmod +x ./docker-entrypoint.sh && mkdir -p /app/data /app/uploads /app/backups
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:4000/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"
ENTRYPOINT ["dumb-init", "--"]
CMD ["./docker-entrypoint.sh"]
