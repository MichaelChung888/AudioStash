import { createDb, type Database, runMigrations } from '@pluck/db';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { sql } from 'drizzle-orm';

export interface TestDatabase {
  db: Database;
  reset(): Promise<void>;
  stop(): Promise<void>;
}

// Starts a throwaway Postgres in Docker and runs the migrations.
// TEST_DATABASE_URL points the tests at an existing server instead. Every table in
// it is emptied before each test, so never point it at a database you care about.
export async function startTestDatabase(): Promise<TestDatabase> {
  let container: StartedPostgreSqlContainer | null = null;
  let url = process.env.TEST_DATABASE_URL;
  if (!url) {
    container = await new PostgreSqlContainer('postgres:18-alpine').start();
    url = container.getConnectionUri();
  }

  await runMigrations(url);
  const { db, close } = createDb(url);
  const tables = await db.execute<{ tablename: string }>(sql`select tablename from pg_tables where schemaname = 'public'`);
  const tableList = sql.raw(tables.map((t) => `"${t.tablename}"`).join(', '));

  return {
    db,
    async reset() {
      await db.execute(sql`truncate ${tableList} restart identity cascade`);
    },
    async stop() {
      await close();
      await container?.stop();
    },
  };
}
