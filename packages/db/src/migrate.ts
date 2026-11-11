import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { createDb } from './client.ts';

// fileURLToPath, not URL.pathname: on Windows the pathname is "/C:/..." and fails.
const MIGRATIONS_FOLDER = fileURLToPath(new URL('../drizzle', import.meta.url));
// Any constant works. It makes two processes migrating at once take turns.
const MIGRATION_LOCK_ID = 7_301_955;

export async function runMigrations(databaseUrl: string): Promise<void> {
  const { db, close } = createDb(databaseUrl, { maxConnections: 1 });
  try {
    await db.execute(sql`select pg_advisory_lock(${MIGRATION_LOCK_ID})`);
    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
    await db.execute(sql`select pg_advisory_unlock(${MIGRATION_LOCK_ID})`);
  } finally {
    await close();
  }
}
