import { type ChangeEntity, type ChangeOp, type Executor, libraryChanges, type Transaction } from '@pluck/db';
import { asc, gt, max, sql } from 'drizzle-orm';

export type ChangeRow = typeof libraryChanges.$inferSelect;

export interface ChangeInput {
  entity: ChangeEntity;
  entityId: string;
  op: ChangeOp;
}

const CHANGE_LOG_LOCK_ID = 4_120_771;

// Sequence numbers are handed out when a row is inserted, but transactions can
// commit in a different order. Without this lock a phone could read seq 11
// before seq 10 commits, move its cursor past 10, and never receive change 10.
// The lock lasts until the transaction ends, so change-log writers commit one at a time.
// Call this as the last statement of a transaction. Taking row locks after it can deadlock.
export async function recordChanges(tx: Transaction, changes: readonly ChangeInput[]): Promise<number | null> {
  if (changes.length === 0) return null;
  await tx.execute(sql`select pg_advisory_xact_lock(${CHANGE_LOG_LOCK_ID})`);
  const rows = await tx
    .insert(libraryChanges)
    .values([...changes])
    .returning({ seq: libraryChanges.seq });
  return Math.max(...rows.map((r) => r.seq));
}

export function listAfter(db: Executor, cursor: number, limit: number) {
  return db.select().from(libraryChanges).where(gt(libraryChanges.seq, cursor)).orderBy(asc(libraryChanges.seq)).limit(limit);
}

export async function latestSeq(db: Executor): Promise<number> {
  const [row] = await db.select({ seq: max(libraryChanges.seq) }).from(libraryChanges);
  return row?.seq ?? 0;
}
