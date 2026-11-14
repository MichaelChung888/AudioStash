import type { Mutation, MutationType } from '@audiostash/contracts';
import { positionsAfter } from '@audiostash/core';
import { randomUUID } from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';
import { requestSync } from '../sync/engine.ts';
import { db, notifyLibraryChanged } from './database.ts';
import * as rows from './rows.ts';

// Every edit is applied to the local tables at once, so the screen updates with no
// connection, and queued in the outbox in the same transaction. The sync engine
// sends the outbox later; see sync/engine.ts.

type PayloadOf<T extends MutationType> = Extract<Mutation, { type: T }>['payload'];

async function commit<T extends MutationType>(type: T, payload: PayloadOf<T>, applyLocally: (tx: SQLiteDatabase) => Promise<void>): Promise<void> {
  const mutation = { id: randomUUID(), type, payload, createdAt: new Date().toISOString() };
  await db().withExclusiveTransactionAsync(async (tx) => {
    await applyLocally(tx);
    await tx.runAsync('INSERT INTO outbox (mutation) VALUES (?)', JSON.stringify(mutation));
  });
  notifyLibraryChanged();
  void requestSync();
}

export async function createPlaylist(name: string): Promise<string> {
  const playlistId = randomUUID();
  const now = new Date().toISOString();
  await commit('playlist.create', { playlistId, name }, (tx) =>
    rows.upsertPlaylist(tx, { id: playlistId, name, description: null, sourceUrl: null, createdAt: now, updatedAt: now }),
  );
  return playlistId;
}

export async function renamePlaylist(playlistId: string, name: string): Promise<void> {
  await commit('playlist.update', { playlistId, name }, async (tx) => {
    const playlist = await rows.readPlaylist(tx, playlistId);
    if (playlist) await rows.upsertPlaylist(tx, { ...playlist, name, updatedAt: new Date().toISOString() });
  });
}

export async function deletePlaylist(playlistId: string): Promise<void> {
  await commit('playlist.delete', { playlistId }, (tx) => rows.deletePlaylist(tx, playlistId));
}

// Songs already in the playlist are skipped. Returns how many were added.
export async function addSongsToPlaylist(playlistId: string, songIds: readonly string[]): Promise<number> {
  const database = db();
  const existing = await database.getAllAsync<{ song_id: string }>('SELECT song_id FROM entries WHERE playlist_id = ?', playlistId);
  const present = new Set(existing.map((row) => row.song_id));
  const toAdd = [...new Set(songIds)].filter((id) => !present.has(id));
  if (toAdd.length === 0) return 0;

  const last = await database.getFirstAsync<{ position: string }>(
    'SELECT position FROM entries WHERE playlist_id = ? ORDER BY position DESC LIMIT 1',
    playlistId,
  );
  const positions = positionsAfter(last?.position ?? null, toAdd.length);
  const addedAt = new Date().toISOString();
  const entries = toAdd.map((songId, i) => ({ entryId: randomUUID(), songId, position: positions[i] as string }));

  await commit('playlist.addSongs', { playlistId, entries }, async (tx) => {
    for (const entry of entries) {
      await rows.upsertEntry(tx, { id: entry.entryId, playlistId, songId: entry.songId, position: entry.position, addedAt });
    }
  });
  return toAdd.length;
}

// `position` comes from positionBetween() on the entries either side of the new place.
export async function moveEntry(entryId: string, position: string): Promise<void> {
  await commit('playlist.moveEntry', { entryId, position }, (tx) =>
    tx.runAsync('UPDATE entries SET position = ? WHERE id = ?', position, entryId).then(() => {}),
  );
}

export async function removeEntry(entryId: string): Promise<void> {
  await commit('playlist.removeEntry', { entryId }, (tx) => rows.deleteEntry(tx, entryId));
}

export async function deleteSong(songId: string): Promise<void> {
  await commit('song.delete', { songId }, (tx) => rows.deleteSong(tx, songId));
}

export async function recordPlay(songId: string): Promise<void> {
  const playedAt = new Date().toISOString();
  await commit('song.played', { songId, playedAt }, async (tx) => {
    const song = await rows.readSong(tx, songId);
    if (song) await rows.upsertSong(tx, { ...song, playCount: song.playCount + 1, lastPlayedAt: playedAt });
  });
}
