import type { JobName, JobPayload } from '@audiostash/contracts';
import { type Executor, outbox, type Transaction } from '@audiostash/db';
import { and, asc, inArray, isNotNull, isNull, lt, sql } from 'drizzle-orm';

export type OutboxRow = typeof outbox.$inferSelect;

export interface OutboxJob<N extends JobName = JobName> {
  job: N;
  payload: JobPayload<N>;
}

export async function enqueue(tx: Transaction, jobs: readonly OutboxJob[]): Promise<void> {
  if (jobs.length === 0) return;
  await tx.insert(outbox).values(jobs.map((j) => ({ job: j.job, payload: j.payload })));
}

// SKIP LOCKED: rows another relay is publishing are left out instead of waited on,
// so several API instances can drain the outbox at once without double-publishing.
export function lockUnpublished(tx: Transaction, limit: number): Promise<OutboxRow[]> {
  return tx.select().from(outbox).where(isNull(outbox.publishedAt)).orderBy(asc(outbox.id)).limit(limit).for('update', { skipLocked: true });
}

export async function markPublished(tx: Transaction, ids: readonly number[]): Promise<void> {
  if (ids.length === 0) return;
  await tx
    .update(outbox)
    .set({ publishedAt: new Date() })
    .where(inArray(outbox.id, [...ids]));
}

export async function markFailed(tx: Transaction, id: number, error: string): Promise<void> {
  await tx
    .update(outbox)
    .set({ attempts: sql`${outbox.attempts} + 1`, lastError: error })
    .where(sql`${outbox.id} = ${id}`);
}

export async function deletePublishedBefore(db: Executor, cutoff: Date): Promise<number> {
  const rows = await db
    .delete(outbox)
    .where(and(isNotNull(outbox.publishedAt), lt(outbox.publishedAt, cutoff)))
    .returning({ id: outbox.id });
  return rows.length;
}
