import type { Change, Mutation } from '@pluck/contracts';
import type { SQLiteDatabase } from 'expo-sqlite';
import { api } from '../api/endpoints.ts';
import { db, notifyLibraryChanged } from '../db/database.ts';
import { deleteEntry, deletePlaylist, deleteSong, upsertEntry, upsertPlaylist, upsertSong } from '../db/rows.ts';
import { deleteSetting, getSetting, setSetting } from '../db/settings.ts';

// Two-way sync with the server:
// 1. Push: send the outbox (edits made on this phone) in order. Each carries an id,
//    so sending it twice after a dropped connection applies it once.
// 2. Pull: fetch the change log after our cursor and apply it in one transaction per page.
// Push runs first, so the pull brings back our own edits as the server stored them.

const PUSH_BATCH = 200;

let running: Promise<void> | null = null;
let runAgain = false;
const syncedListeners = new Set<() => void>();

// Safe to call often: calls made while a sync runs are merged into one more run.
export function requestSync(): Promise<void> {
  if (running) {
    runAgain = true;
    return running;
  }
  running = (async () => {
    try {
      do {
        runAgain = false;
        await pushOutbox();
        await pullChanges();
      } while (runAgain);
      for (const listener of syncedListeners) listener();
    } catch (err) {
      // Usually offline. The outbox and cursor are unchanged, so the next run carries on.
      console.warn('Sync stopped:', err instanceof Error ? err.message : err);
    } finally {
      running = null;
    }
  })();
  return running;
}

// Called after a sync completes with the whole library pulled.
export function onSynced(listener: () => void): () => void {
  syncedListeners.add(listener);
  return () => syncedListeners.delete(listener);
}

async function pushOutbox(): Promise<void> {
  for (;;) {
    const rows = await db().getAllAsync<{ seq: number; mutation: string }>('SELECT seq, mutation FROM outbox ORDER BY seq LIMIT ?', PUSH_BATCH);
    const last = rows.at(-1);
    if (!last) return;

    const { results } = await api.push(rows.map((row) => JSON.parse(row.mutation) as Mutation));
    await db().withExclusiveTransactionAsync(async (tx) => {
      await tx.runAsync('DELETE FROM outbox WHERE seq <= ?', last.seq);
      // A rejected edit, e.g. adding to a playlist another phone deleted, is already
      // applied here. Pulling everything again replaces it with the server's state.
      if (results.some((result) => result.status === 'rejected')) await setSetting('resync', '1', tx);
    });
  }
}

async function pullChanges(): Promise<void> {
  const resync = (await getSetting('resync')) !== null;
  let cursor = resync ? 0 : Number((await getSetting('cursor')) ?? 0);
  let firstPage = true;

  for (;;) {
    const page = await api.pull(cursor);
    const replaceAll = resync && firstPage;
    await db().withExclusiveTransactionAsync(async (tx) => {
      if (replaceAll) await tx.execAsync('DELETE FROM songs; DELETE FROM playlists; DELETE FROM entries;');
      await applyChanges(tx, page.changes);
      await setSetting('cursor', String(page.cursor), tx);
      if (resync && !page.hasMore) await deleteSetting('resync', tx);
    });
    notifyLibraryChanged();

    firstPage = false;
    cursor = page.cursor;
    if (!page.hasMore) return;
  }
}

async function applyChanges(tx: SQLiteDatabase, changes: readonly Change[]): Promise<void> {
  for (const change of changes) {
    switch (change.type) {
      case 'song.upserted':
        await upsertSong(tx, change.data);
        break;
      case 'song.deleted':
        await deleteSong(tx, change.id);
        break;
      case 'playlist.upserted':
        await upsertPlaylist(tx, change.data);
        break;
      case 'playlist.deleted':
        await deletePlaylist(tx, change.id);
        break;
      case 'entry.upserted':
        await upsertEntry(tx, change.data);
        break;
      case 'entry.deleted':
        await deleteEntry(tx, change.id);
        break;
    }
  }
}
