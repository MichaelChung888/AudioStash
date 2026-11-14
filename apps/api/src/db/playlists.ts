import { type Executor, playlists, type Transaction } from '@audiostash/db';
import { eq, inArray } from 'drizzle-orm';

export type PlaylistRow = typeof playlists.$inferSelect;
export type NewPlaylist = typeof playlists.$inferInsert;

export async function findById(db: Executor, id: string): Promise<PlaylistRow | null> {
  const [row] = await db.select().from(playlists).where(eq(playlists.id, id)).limit(1);
  return row ?? null;
}

export function findByIds(db: Executor, ids: readonly string[]): Promise<PlaylistRow[]> {
  if (ids.length === 0) return Promise.resolve([]);
  return db
    .select()
    .from(playlists)
    .where(inArray(playlists.id, [...ids]));
}

// Row lock: other transactions that lock the same playlist wait until this one ends.
// Used when appending songs, so two appends never compute the same "last position".
export async function lockById(tx: Transaction, id: string): Promise<PlaylistRow | null> {
  const [row] = await tx.select().from(playlists).where(eq(playlists.id, id)).for('update');
  return row ?? null;
}

// Returns null if a playlist with this id already exists.
export async function insert(tx: Transaction, values: NewPlaylist): Promise<PlaylistRow | null> {
  const [row] = await tx.insert(playlists).values(values).onConflictDoNothing({ target: playlists.id }).returning();
  return row ?? null;
}

export async function update(
  tx: Transaction,
  id: string,
  patch: Partial<Pick<NewPlaylist, 'name' | 'description' | 'sourceUrl'>>,
): Promise<PlaylistRow | null> {
  const [row] = await tx.update(playlists).set(patch).where(eq(playlists.id, id)).returning();
  return row ?? null;
}

export async function remove(tx: Transaction, id: string): Promise<boolean> {
  const rows = await tx.delete(playlists).where(eq(playlists.id, id)).returning({ id: playlists.id });
  return rows.length > 0;
}
