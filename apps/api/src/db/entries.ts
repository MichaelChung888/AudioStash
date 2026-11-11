import { type Executor, playlistEntries, type Transaction } from '@pluck/db';
import { eq, inArray, max } from 'drizzle-orm';

export type EntryRow = typeof playlistEntries.$inferSelect;
export type NewEntry = typeof playlistEntries.$inferInsert;

export async function findById(db: Executor, id: string): Promise<EntryRow | null> {
  const [row] = await db.select().from(playlistEntries).where(eq(playlistEntries.id, id)).limit(1);
  return row ?? null;
}

export function findByIds(db: Executor, ids: readonly string[]): Promise<EntryRow[]> {
  if (ids.length === 0) return Promise.resolve([]);
  return db
    .select()
    .from(playlistEntries)
    .where(inArray(playlistEntries.id, [...ids]));
}

// The column uses COLLATE "C", so max() compares bytes, matching fractional index order.
export async function lastPosition(db: Executor, playlistId: string): Promise<string | null> {
  const [row] = await db
    .select({ position: max(playlistEntries.position) })
    .from(playlistEntries)
    .where(eq(playlistEntries.playlistId, playlistId));
  return row?.position ?? null;
}

// Skips songs already in the playlist. Returns only the rows actually inserted.
export function insertMany(tx: Transaction, values: readonly NewEntry[]): Promise<EntryRow[]> {
  if (values.length === 0) return Promise.resolve([]);
  return tx
    .insert(playlistEntries)
    .values([...values])
    .onConflictDoNothing()
    .returning();
}

export async function updatePosition(tx: Transaction, id: string, position: string): Promise<EntryRow | null> {
  const [row] = await tx.update(playlistEntries).set({ position }).where(eq(playlistEntries.id, id)).returning();
  return row ?? null;
}

export async function remove(tx: Transaction, id: string): Promise<boolean> {
  const rows = await tx.delete(playlistEntries).where(eq(playlistEntries.id, id)).returning({ id: playlistEntries.id });
  return rows.length > 0;
}

export async function removeByPlaylist(tx: Transaction, playlistId: string): Promise<string[]> {
  const rows = await tx.delete(playlistEntries).where(eq(playlistEntries.playlistId, playlistId)).returning({ id: playlistEntries.id });
  return rows.map((r) => r.id);
}

export async function removeBySong(tx: Transaction, songId: string): Promise<string[]> {
  const rows = await tx.delete(playlistEntries).where(eq(playlistEntries.songId, songId)).returning({ id: playlistEntries.id });
  return rows.map((r) => r.id);
}
