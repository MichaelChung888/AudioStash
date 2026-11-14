import type { ItemStatus } from '@audiostash/contracts';
import { downloadItems, downloads, type Executor, type Transaction } from '@audiostash/db';
import { and, asc, eq, inArray, isNotNull, max, sql } from 'drizzle-orm';

export type ItemRow = typeof downloadItems.$inferSelect;
export type NewItem = typeof downloadItems.$inferInsert;

export type ItemCounts = Record<ItemStatus, number> & { total: number };

export const emptyCounts = (): ItemCounts => ({ total: 0, queued: 0, active: 0, completed: 0, skipped: 0, failed: 0, cancelled: 0 });

export async function findById(db: Executor, id: string): Promise<ItemRow | null> {
  const [row] = await db.select().from(downloadItems).where(eq(downloadItems.id, id)).limit(1);
  return row ?? null;
}

export async function lockById(tx: Transaction, id: string): Promise<ItemRow | null> {
  const [row] = await tx.select().from(downloadItems).where(eq(downloadItems.id, id)).for('update');
  return row ?? null;
}

export function listByDownload(db: Executor, downloadId: string): Promise<ItemRow[]> {
  return db.select().from(downloadItems).where(eq(downloadItems.downloadId, downloadId)).orderBy(asc(downloadItems.position));
}

// Postgres allows 65,535 parameters per statement. A 5,000-song playlist at ~12
// columns per row is over that, so rows are inserted in chunks.
const INSERT_CHUNK = 1_000;

export async function insertMany(tx: Transaction, values: readonly NewItem[]): Promise<ItemRow[]> {
  const rows: ItemRow[] = [];
  for (let i = 0; i < values.length; i += INSERT_CHUNK) {
    rows.push(
      ...(await tx
        .insert(downloadItems)
        .values(values.slice(i, i + INSERT_CHUNK))
        .returning()),
    );
  }
  return rows;
}

export async function update(tx: Transaction, id: string, patch: Partial<NewItem>): Promise<ItemRow> {
  const [row] = await tx.update(downloadItems).set(patch).where(eq(downloadItems.id, id)).returning();
  if (!row) throw new Error(`download item ${id} not found for update`);
  return row;
}

export function updateWhereStatus(tx: Transaction, downloadId: string, from: readonly ItemStatus[], patch: Partial<NewItem>): Promise<ItemRow[]> {
  return tx
    .update(downloadItems)
    .set(patch)
    .where(and(eq(downloadItems.downloadId, downloadId), inArray(downloadItems.status, [...from])))
    .returning();
}

export async function countByDownload(db: Executor, downloadIds: readonly string[]): Promise<Map<string, ItemCounts>> {
  const result = new Map(downloadIds.map((id) => [id, emptyCounts()]));
  if (downloadIds.length === 0) return result;
  const rows = await db
    .select({ downloadId: downloadItems.downloadId, status: downloadItems.status, count: sql<number>`count(*)::int` })
    .from(downloadItems)
    .where(inArray(downloadItems.downloadId, [...downloadIds]))
    .groupBy(downloadItems.downloadId, downloadItems.status);
  for (const row of rows) {
    const counts = result.get(row.downloadId);
    if (!counts) continue;
    counts[row.status] += row.count;
    counts.total += row.count;
  }
  return result;
}

// The last playlist position handed to a pending item, so a second download into
// the same playlist is placed after the first one's songs rather than among them.
export async function lastPendingPlaylistPosition(db: Executor, playlistId: string): Promise<string | null> {
  const [row] = await db
    .select({ position: max(downloadItems.playlistPosition) })
    .from(downloadItems)
    .innerJoin(downloads, eq(downloads.id, downloadItems.downloadId))
    .where(and(eq(downloads.playlistId, playlistId), isNotNull(downloadItems.playlistPosition), inArray(downloadItems.status, ['queued', 'active'])));
  return row?.position ?? null;
}
