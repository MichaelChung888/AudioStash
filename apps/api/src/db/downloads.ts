import { type DownloadStatus, FINISHED_DOWNLOAD_STATUSES } from '@audiostash/contracts';
import { downloads, type Executor, type Transaction } from '@audiostash/db';
import { and, desc, eq, inArray, lt, notInArray, type SQL } from 'drizzle-orm';

export type DownloadRow = typeof downloads.$inferSelect;
export type NewDownload = typeof downloads.$inferInsert;

export async function findById(db: Executor, id: string): Promise<DownloadRow | null> {
  const [row] = await db.select().from(downloads).where(eq(downloads.id, id)).limit(1);
  return row ?? null;
}

export async function lockById(tx: Transaction, id: string): Promise<DownloadRow | null> {
  const [row] = await tx.select().from(downloads).where(eq(downloads.id, id)).for('update');
  return row ?? null;
}

export async function insert(tx: Transaction, values: NewDownload): Promise<DownloadRow> {
  const [row] = await tx.insert(downloads).values(values).returning();
  if (!row) throw new Error('download insert returned no row');
  return row;
}

export async function update(tx: Transaction, id: string, patch: Partial<NewDownload>): Promise<DownloadRow> {
  const [row] = await tx.update(downloads).set(patch).where(eq(downloads.id, id)).returning();
  if (!row) throw new Error(`download ${id} not found for update`);
  return row;
}

export async function remove(tx: Transaction, id: string): Promise<void> {
  await tx.delete(downloads).where(eq(downloads.id, id));
}

export function list(db: Executor, filter: { status: 'open' | 'finished' | 'all'; limit: number; before?: Date | undefined }): Promise<DownloadRow[]> {
  const finished = FINISHED_DOWNLOAD_STATUSES as DownloadStatus[];
  const conditions: SQL[] = [];
  if (filter.status === 'open') conditions.push(notInArray(downloads.status, finished));
  if (filter.status === 'finished') conditions.push(inArray(downloads.status, finished));
  if (filter.before) conditions.push(lt(downloads.createdAt, filter.before));
  return db
    .select()
    .from(downloads)
    .where(and(...conditions))
    .orderBy(desc(downloads.createdAt))
    .limit(filter.limit);
}
