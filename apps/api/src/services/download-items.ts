import { randomUUID } from 'node:crypto';
import type { ItemInput } from '@pluck/contracts';
import { comparePositions, positionsAfter } from '@pluck/core';
import type { Transaction } from '@pluck/db';
import type { ChangeInput } from '../db/changes.ts';
import type { DownloadRow } from '../db/downloads.ts';
import * as entriesDb from '../db/entries.ts';
import type { ItemRow } from '../db/items.ts';
import * as itemsDb from '../db/items.ts';
import * as outboxDb from '../db/outbox.ts';
import * as playlistsDb from '../db/playlists.ts';

export const ALREADY_IN_LIBRARY = 'Already in your library';

export interface ItemPlan {
  input: ItemInput;
  title: string;
  artist: string | null;
  // Set when the song is already in the library: the item is skipped and only linked to the playlist.
  existingSongId: string | null;
}

// Adds items to a download: reserves their playlist positions, links songs that are
// already in the library, and queues a job for every other item.
// Returns the library changes; the caller records them last in its transaction.
export async function addItems(
  tx: Transaction,
  download: DownloadRow,
  plans: readonly ItemPlan[],
  firstPosition = 0,
): Promise<{ items: ItemRow[]; changes: ChangeInput[] }> {
  const playlistId = download.playlistId && (await playlistsDb.lockById(tx, download.playlistId)) ? download.playlistId : null;
  const positions = playlistId ? await reservePlaylistPositions(tx, playlistId, plans.length) : [];
  const now = new Date();

  const items = await itemsDb.insertMany(
    tx,
    plans.map((plan, i) => {
      const skipped = plan.existingSongId !== null;
      return {
        id: randomUUID(),
        downloadId: download.id,
        position: firstPosition + i,
        input: plan.input,
        title: plan.title,
        artist: plan.artist,
        status: skipped ? 'skipped' : 'queued',
        songId: plan.existingSongId,
        error: skipped ? ALREADY_IN_LIBRARY : null,
        finishedAt: skipped ? now : null,
        playlistPosition: positions[i] ?? null,
      };
    }),
  );

  const changes: ChangeInput[] = [];
  if (playlistId) {
    const entries = await entriesDb.insertMany(
      tx,
      items.flatMap((item) =>
        item.status === 'skipped' && item.songId && item.playlistPosition
          ? [{ id: randomUUID(), playlistId, songId: item.songId, position: item.playlistPosition }]
          : [],
      ),
    );
    changes.push(...entries.map((entry) => ({ entity: 'entry' as const, entityId: entry.id, op: 'upsert' as const })));
  }

  await outboxDb.enqueue(
    tx,
    items.filter((item) => item.status === 'queued').map((item) => ({ job: 'download.item', payload: { downloadId: download.id, itemId: item.id } })),
  );
  return { items, changes };
}

// New songs go after everything already in the playlist and after songs other
// downloads have reserved a place for. Callers must hold the playlist row lock.
async function reservePlaylistPositions(tx: Transaction, playlistId: string, count: number): Promise<string[]> {
  if (count === 0) return [];
  const candidates = [await entriesDb.lastPosition(tx, playlistId), await itemsDb.lastPendingPlaylistPosition(tx, playlistId)];
  const last =
    candidates
      .filter((p): p is string => p !== null)
      .sort(comparePositions)
      .at(-1) ?? null;
  return positionsAfter(last, count);
}

// Puts a finished song into its download's playlist. Null if the download has no
// playlist or the song is already in it.
export async function linkToPlaylist(tx: Transaction, download: DownloadRow, item: ItemRow, songId: string): Promise<ChangeInput | null> {
  if (!download.playlistId) return null;
  let position = item.playlistPosition;
  if (!position) {
    if (!(await playlistsDb.lockById(tx, download.playlistId))) return null;
    position = (await reservePlaylistPositions(tx, download.playlistId, 1))[0] ?? null;
  }
  if (!position) return null;
  const [entry] = await entriesDb.insertMany(tx, [{ id: randomUUID(), playlistId: download.playlistId, songId, position }]);
  return entry ? { entity: 'entry', entityId: entry.id, op: 'upsert' } : null;
}
