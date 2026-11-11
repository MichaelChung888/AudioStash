import type { SongSource } from '@pluck/contracts';
import { type Executor, songs, type Transaction } from '@pluck/db';
import { and, desc, eq, inArray, isNotNull, sql } from 'drizzle-orm';

export type SongRow = typeof songs.$inferSelect;
export type NewSong = typeof songs.$inferInsert;

export async function findById(db: Executor, id: string): Promise<SongRow | null> {
  const [row] = await db.select().from(songs).where(eq(songs.id, id)).limit(1);
  return row ?? null;
}

export function findByIds(db: Executor, ids: readonly string[]): Promise<SongRow[]> {
  if (ids.length === 0) return Promise.resolve([]);
  return db
    .select()
    .from(songs)
    .where(inArray(songs.id, [...ids]));
}

// A song counts as already downloaded if it came from the same source, or if it
// has the same ISRC (the industry-wide recording code) from any source.
export async function findExisting(db: Executor, match: { source: SongSource; sourceId: string; isrc: string | null }): Promise<SongRow | null> {
  const [bySource] = await db
    .select()
    .from(songs)
    .where(and(eq(songs.source, match.source), eq(songs.sourceId, match.sourceId)))
    .limit(1);
  if (bySource) return bySource;
  if (!match.isrc) return null;
  const [byIsrc] = await db.select().from(songs).where(eq(songs.isrc, match.isrc)).limit(1);
  return byIsrc ?? null;
}

export function findBySourceIds(db: Executor, source: SongSource, sourceIds: readonly string[]): Promise<SongRow[]> {
  if (sourceIds.length === 0) return Promise.resolve([]);
  return db
    .select()
    .from(songs)
    .where(and(eq(songs.source, source), inArray(songs.sourceId, [...sourceIds])));
}

export function findByLowerTitles(db: Executor, lowerTitles: readonly string[]) {
  if (lowerTitles.length === 0) return Promise.resolve([]);
  return db
    .select({ title: songs.title, artist: songs.artist, albumArtist: songs.albumArtist })
    .from(songs)
    .where(inArray(sql`lower(${songs.title})`, [...lowerTitles]));
}

export async function findByIsrc(db: Executor, isrc: string): Promise<SongRow | null> {
  const [row] = await db.select().from(songs).where(eq(songs.isrc, isrc)).limit(1);
  return row ?? null;
}

export async function isPathTaken(db: Executor, path: string, exceptSongId?: string): Promise<boolean> {
  const [row] = await db.select({ id: songs.id }).from(songs).where(sql`lower(${songs.path}) = lower(${path})`).limit(1);
  return row !== undefined && row.id !== exceptSongId;
}

// Two songs finishing at once with the same artist and title would both see the
// path as free. This lock makes the second wait until the first commits.
export async function lockPath(tx: Transaction, path: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(lower(${path})))`);
}

export async function insert(tx: Transaction, values: NewSong): Promise<SongRow> {
  const [row] = await tx.insert(songs).values(values).returning();
  if (!row) throw new Error('song insert returned no row');
  return row;
}

export async function update(tx: Transaction, id: string, patch: Partial<NewSong>): Promise<SongRow | null> {
  const [row] = await tx.update(songs).set(patch).where(eq(songs.id, id)).returning();
  return row ?? null;
}

export async function remove(tx: Transaction, id: string): Promise<SongRow | null> {
  const [row] = await tx.delete(songs).where(eq(songs.id, id)).returning();
  return row ?? null;
}

export async function recordPlay(tx: Transaction, id: string, playedAt: Date): Promise<SongRow | null> {
  const [row] = await tx
    .update(songs)
    .set({
      playCount: sql`${songs.playCount} + 1`,
      lastPlayedAt: sql`greatest(${songs.lastPlayedAt}, ${playedAt.toISOString()}::timestamptz)`,
    })
    .where(eq(songs.id, id))
    .returning();
  return row ?? null;
}

export function findByIsrcs(db: Executor, isrcs: readonly string[]) {
  if (isrcs.length === 0) return Promise.resolve([]);
  return db
    .select({ id: songs.id, isrc: songs.isrc })
    .from(songs)
    .where(inArray(songs.isrc, [...isrcs]));
}

export async function isrcsInLibrary(db: Executor, isrcs: readonly string[]): Promise<Set<string>> {
  if (isrcs.length === 0) return new Set();
  const rows = await db
    .selectDistinct({ isrc: songs.isrc })
    .from(songs)
    .where(inArray(songs.isrc, [...isrcs]));
  return new Set(rows.flatMap((r) => (r.isrc ? [r.isrc] : [])));
}

// Artists ranked by plays, then by how many of their songs are in the library.
export function topArtists(db: Executor, limit: number) {
  const artist = sql<string>`coalesce(${songs.albumArtist}, ${songs.artist})`;
  return db
    .select({ artist, plays: sql<number>`sum(${songs.playCount})::int`, songs: sql<number>`count(*)::int` })
    .from(songs)
    .where(isNotNull(songs.artist))
    .groupBy(artist)
    .orderBy(desc(sql`sum(${songs.playCount})`), desc(sql`count(*)`))
    .limit(limit);
}
