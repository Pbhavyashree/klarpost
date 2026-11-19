import { mkdirSync } from "node:fs";
import path from "node:path";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";

/**
 * Production uses a real PostgreSQL server (DATABASE_URL). Local development
 * and tests use PGlite, a WebAssembly build of Postgres that needs no install.
 * Both run the same migrations, so behaviour is identical.
 */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

const MIGRATIONS = path.join(process.cwd(), "drizzle");

async function connect(url = process.env.DATABASE_URL): Promise<Db> {
  if (url && url.startsWith("postgres")) {
    const { drizzle } = await import("drizzle-orm/postgres-js");
    const { migrate } = await import("drizzle-orm/postgres-js/migrator");
    const postgres = (await import("postgres")).default;
    const db = drizzle(postgres(url, { max: 10 }), { schema });
    await migrate(db, { migrationsFolder: MIGRATIONS });
    return db as unknown as Db;
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const dir = url === "memory://" ? undefined : (url ?? path.join(process.cwd(), ".data", "pglite"));
  if (dir) mkdirSync(dir, { recursive: true });
  const db = drizzle(new PGlite(dir), { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS });
  return db as unknown as Db;
}

const globalForDb = globalThis as unknown as { klarpostDb?: Promise<Db> };

/** One shared connection per process (survives Next.js hot reloads in dev). */
export function getDb(): Promise<Db> {
  globalForDb.klarpostDb ??= connect();
  return globalForDb.klarpostDb;
}

/** A fresh in-memory database, for tests. */
export function createTestDb(): Promise<Db> {
  return connect("memory://");
}
