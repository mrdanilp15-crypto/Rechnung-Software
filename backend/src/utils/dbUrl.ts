/**
 * Prisma-Verbindungs-URL -> URL für die PostgreSQL-Kommandozeilenwerkzeuge (pg_dump, psql).
 * Prisma erwartet z.B. "?schema=public" (und "connection_limit" usw.); libpq kennt diese Parameter nicht und bricht mit
 * `invalid URI query parameter: "schema"` ab - das ließ jedes Backup in der Docker-Installation scheitern.
 */
const PRISMA_ONLY_PARAMS = ["schema", "connection_limit", "pool_timeout", "pgbouncer", "socket_timeout", "statement_cache_size", "connect_timeout_prisma"];

export function libpqUrl(databaseUrl: string): string {
  try {
    const url = new URL(databaseUrl);
    for (const p of PRISMA_ONLY_PARAMS) url.searchParams.delete(p);
    return url.toString();
  } catch {
    return databaseUrl;
  }
}
