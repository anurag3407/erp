import postgres from 'postgres';

/**
 * PostgreSQL connection for the Enterprise College ERP.
 *
 * A DATABASE_URL is mandatory — there is no in-memory fallback. If it is
 * missing the process fails fast so misconfiguration cannot silently serve
 * stale/dummy data.
 */
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    'DATABASE_URL is not set. The ERP requires a PostgreSQL connection (see .env.example).'
  );
}

declare global {
  // Reuse the connection across Next.js dev hot-reloads.
  // eslint-disable-next-line no-var
  var __erpSql: ReturnType<typeof postgres> | undefined;
}

export const sql =
  globalThis.__erpSql ??
  postgres(connectionString, {
    max: 20,
    idle_timeout: 20,
    connect_timeout: 10,
    types: {
      // Return numeric/decimal as JS numbers (domain types use number).
      numeric: {
        to: 0,
        from: [1700],
        serialize: (x: number) => x.toString(),
        parse: (x: string) => Number(x),
      },
      int8: {
        to: 20,
        from: [20],
        serialize: (x: number) => x.toString(),
        parse: (x: string) => Number(x),
      },
    },
  });

if (!globalThis.__erpSql) {
  globalThis.__erpSql = sql;
}

export type Sql = typeof sql;

/** Verify connectivity — used by health checks and the seed script. */
export async function pingDatabase(): Promise<void> {
  await sql`SELECT 1`;
}

export async function closeDatabase(): Promise<void> {
  await sql.end({ timeout: 5 });
}
