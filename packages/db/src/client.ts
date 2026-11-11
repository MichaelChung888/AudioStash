import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.ts';

export function createDb(url: string, options: { maxConnections?: number } = {}) {
  const client = postgres(url, { max: options.maxConnections ?? 10, onnotice: () => {} });
  const db = drizzle({ client, schema, casing: 'snake_case' });
  return { db, close: () => client.end({ timeout: 5 }) };
}

export type Database = ReturnType<typeof createDb>['db'];
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
// Data-access functions accept either, so callers decide whether a write joins a transaction.
export type Executor = Database | Transaction;
