import { randomUUID } from 'node:crypto';
import {
  AUDIO_CONTENT_TYPES,
  type ClaimRequest,
  FINISHED_ITEM_STATUSES,
  type ItemClaimResponse,
  type ItemComplete,
  type ItemFail,
  type ItemSource,
  type ItemSourceResponse,
  type ItemStage,
  type ResolveClaimResponse,
  type ResolveComplete,
  type ResolvedEntry,
  type ResolveFail,
  type UploadUrlsRequest,
  type UploadUrlsResponse,
} from '@pluck/contracts';
import { type ParsedSourceUrl, parseSourceUrl } from '@pluck/core';
import type { Database, Transaction } from '@pluck/db';
import { type ChangeInput, recordChanges } from '../db/changes.ts';
import type { DownloadRow } from '../db/downloads.ts';
import * as downloadsDb from '../db/downloads.ts';
import type { ItemCounts, ItemRow } from '../db/items.ts';
import * as itemsDb from '../db/items.ts';
import { toDownload, toItem } from '../db/mappers.ts';
import * as playlistsDb from '../db/playlists.ts';
import * as songsDb from '../db/songs.ts';
import { BadRequestError, ConflictError, NotFoundError } from '../lib/errors.ts';
import { ALREADY_IN_LIBRARY, addItems, type ItemPlan, linkToPlaylist } from './download-items.ts';
import { refreshDownloadStatus } from './download-status.ts';
import type { Notifier } from './notifier.ts';
import { chooseSongPath } from './song-paths.ts';
import { type Storage, storageKeys } from './storage.ts';

interface Deps {
  db: Database;
  storage: Storage;
  notifier: Notifier;
  relay: { kick(): void };
}

const PRESIGN_SECONDS = 60 * 60;

const skip = (reason: string) => ({ status: 'skip' as const, reason });

// Every state change made on behalf of the home worker. The worker only ever talks
// to these methods over HTTP, never to the database.
//
// Lock order is always download row, then item row. Locking the download first
// serialises status changes for its items, so two items finishing at the same
// moment both see each other when the download's status is recounted.
export function createWorkerJobService({ db, storage, notifier, relay }: Deps) {
  async function lockItemWithDownload(tx: Transaction, itemId: string): Promise<{ item: ItemRow; download: DownloadRow }> {
    const found = await itemsDb.findById(tx, itemId);
    if (!found) throw new NotFoundError('Item not found');
    const download = await downloadsDb.lockById(tx, found.downloadId);
    const item = await itemsDb.lockById(tx, itemId);
    if (!download || !item) throw new NotFoundError('Item not found');
    return { item, download };
  }

  function publish(state: { item?: ItemRow; download: DownloadRow; counts: ItemCounts; cursor?: number | null }) {
    if (state.item) notifier.itemChanged(toItem(state.item));
    notifier.downloadChanged(toDownload(state.download, state.counts));
    notifier.libraryChanged(state.cursor ?? null);
  }

  // An uploaded file is only needed until its item finishes.
  async function releaseInput(item: ItemRow) {
    if (item.input.kind === 'upload') await storage.remove([item.input.key]);
  }

  return {
    async claimResolve(downloadId: string): Promise<ResolveClaimResponse> {
      const download = await downloadsDb.findById(db, downloadId);
      if (!download) return skip('Download no longer exists');
      if (download.status !== 'resolving' || !download.sourceUrl) return skip(`Download is ${download.status}`);
      return { status: 'proceed', download: { id: download.id, url: download.sourceUrl, options: download.options } };
    },

    async completeResolve(downloadId: string, body: ResolveComplete): Promise<void> {
      const result = await db.transaction(async (tx) => {
        const download = await downloadsDb.lockById(tx, downloadId);
        if (!download) throw new NotFoundError('Download not found');
        // Already handled: this is a repeated report after a retry.
        if (download.status !== 'resolving') return null;

        const title = body.title.trim() || download.title;
        if (body.entries.length === 0) {
          const failed = await downloadsDb.update(tx, downloadId, { title, status: 'failed', error: 'No songs found at this link', finishedAt: new Date() });
          return { download: failed, counts: itemsDb.emptyCounts(), cursor: null };
        }

        const changes: ChangeInput[] = [];
        if (download.namePlaylistFromSource && download.playlistId) {
          const playlist = await playlistsDb.update(tx, download.playlistId, { name: title });
          if (playlist) changes.push({ entity: 'playlist', entityId: playlist.id, op: 'upsert' });
        }

        const updated = await downloadsDb.update(tx, downloadId, { title, namePlaylistFromSource: false, status: 'queued', error: null });
        const added = await addItems(tx, updated, await planEntries(tx, body.entries));
        changes.push(...added.changes);
        const refreshed = await refreshDownloadStatus(tx, updated);
        return { ...refreshed, cursor: await recordChanges(tx, changes) };
      });
      if (!result) return;
      relay.kick();
      publish(result);
    },

    async failResolve(downloadId: string, body: ResolveFail): Promise<void> {
      const download = await db.transaction(async (tx) => {
        const locked = await downloadsDb.lockById(tx, downloadId);
        if (locked?.status !== 'resolving') return null;
        return downloadsDb.update(tx, downloadId, body.final ? { status: 'failed', error: body.error, finishedAt: new Date() } : { error: body.error });
      });
      if (download) publish({ download, counts: itemsDb.emptyCounts() });
    },

    async claimItem(itemId: string, claim: ClaimRequest): Promise<ItemClaimResponse> {
      // Removing a finished download deletes its items, but their jobs may still be queued.
      if (!(await itemsDb.findById(db, itemId))) return skip('Item no longer exists');
      const result = await db.transaction(async (tx) => {
        const { item, download } = await lockItemWithDownload(tx, itemId);
        if (FINISHED_ITEM_STATUSES.includes(item.status)) return { response: skip(`Item is ${item.status}`) };
        if (download.status === 'cancelled') return { response: skip('Download was cancelled') };

        // An item that is already active was claimed by a worker that crashed or
        // lost its connection. The message was redelivered, so it is claimed again.
        const claimed = await itemsDb.update(tx, itemId, {
          status: 'active',
          stage: null,
          workerId: claim.workerId,
          claimedAt: new Date(),
          attempts: claim.attempt,
          error: null,
        });
        return { claimed, ...(await refreshDownloadStatus(tx, download)) };
      });
      if (!('claimed' in result)) return result.response;

      const { claimed } = result;
      publish({ ...result, item: claimed });
      const inputUrl = claimed.input.kind === 'upload' ? await storage.presignGet(claimed.input.key, PRESIGN_SECONDS) : null;
      return {
        status: 'proceed',
        item: { id: claimed.id, downloadId: claimed.downloadId, input: claimed.input, options: result.download.options, inputUrl },
      };
    },

    // The worker found the audio it will download. If that song is already in the
    // library, the item is skipped here, before anything is downloaded.
    async reportSource(itemId: string, body: ItemSource): Promise<ItemSourceResponse> {
      const result = await db.transaction(async (tx) => {
        const { item, download } = await lockItemWithDownload(tx, itemId);
        if (item.status !== 'active') throw new ConflictError(`Item is ${item.status}`);
        const found = { ...(body.title ? { title: body.title } : {}), ...(body.artist !== undefined ? { artist: body.artist } : {}) };

        const existing = await songsDb.findExisting(tx, { source: body.source, sourceId: body.sourceId, isrc: body.isrc });
        if (existing) {
          const link = await linkToPlaylist(tx, download, item, existing.id);
          const skipped = await itemsDb.update(tx, itemId, {
            ...found,
            status: 'skipped',
            stage: null,
            songId: existing.id,
            error: ALREADY_IN_LIBRARY,
            finishedAt: new Date(),
          });
          const refreshed = await refreshDownloadStatus(tx, download);
          const cursor = await recordChanges(tx, link ? [link] : []);
          return { response: { status: 'duplicate' as const, songId: existing.id }, item: skipped, ...refreshed, cursor };
        }

        const songId = item.pendingSongId ?? randomUUID();
        const updated = await itemsDb.update(tx, itemId, { ...found, pendingSongId: songId });
        // A single-link download is titled with its URL until the worker finds the real title.
        const renamed = body.title && download.title === download.sourceUrl ? await downloadsDb.update(tx, download.id, { title: body.title }) : download;
        const counts = (await itemsDb.countByDownload(tx, [download.id])).get(download.id) ?? itemsDb.emptyCounts();
        return { response: { status: 'proceed' as const, songId }, item: updated, download: renamed, counts, cursor: null };
      });

      publish(result);
      if (result.response.status === 'duplicate') await releaseInput(result.item);
      return result.response;
    },

    async setStage(itemId: string, stage: ItemStage): Promise<void> {
      const item = await db.transaction(async (tx) => {
        const locked = await itemsDb.lockById(tx, itemId);
        if (!locked) throw new NotFoundError('Item not found');
        if (locked.status !== 'active') throw new ConflictError(`Item is ${locked.status}`);
        return itemsDb.update(tx, itemId, { stage });
      });
      notifier.itemChanged(toItem(item));
    },

    async uploadUrls(itemId: string, body: UploadUrlsRequest): Promise<UploadUrlsResponse> {
      const item = await itemsDb.findById(db, itemId);
      if (!item) throw new NotFoundError('Item not found');
      if (item.status !== 'active' || !item.pendingSongId) throw new ConflictError(`Item is ${item.status}`);

      const audioKey = storageKeys.audio(item.pendingSongId, body.codec);
      const audioType = AUDIO_CONTENT_TYPES[body.codec];
      const coverKey = storageKeys.cover(item.pendingSongId);
      return {
        audio: { key: audioKey, url: await storage.presignPut(audioKey, audioType, PRESIGN_SECONDS), contentType: audioType },
        cover: body.hasCover ? { key: coverKey, url: await storage.presignPut(coverKey, 'image/jpeg', PRESIGN_SECONDS), contentType: 'image/jpeg' } : null,
      };
    },

    async completeItem(itemId: string, body: ItemComplete): Promise<{ songId: string }> {
      const before = await itemsDb.findById(db, itemId);
      if (!before) throw new NotFoundError('Item not found');
      if (before.status === 'completed' && before.songId) return { songId: before.songId };

      const songId = before.pendingSongId;
      if (before.status !== 'active' || !songId) {
        if (songId) await storage.remove(storageKeys.allForSong(songId));
        throw new ConflictError(`Item is ${before.status}`);
      }

      // Check the uploads before opening a transaction: these are network calls to the bucket.
      const audioKey = storageKeys.audio(songId, body.audio.codec);
      const uploadedSize = await storage.size(audioKey);
      if (uploadedSize !== body.audio.sizeBytes) {
        throw new BadRequestError(
          uploadedSize === null ? 'The audio file was not uploaded' : `Uploaded audio is ${uploadedSize} bytes, expected ${body.audio.sizeBytes}`,
        );
      }
      const coverKey = body.cover && (await storage.size(storageKeys.cover(songId))) !== null ? storageKeys.cover(songId) : null;

      const result = await db.transaction(async (tx) => {
        const { item, download } = await lockItemWithDownload(tx, itemId);
        if (item.status === 'completed' && item.songId) return { outcome: 'repeat' as const, songId: item.songId };
        if (item.status !== 'active') return { outcome: 'gone' as const, status: item.status };

        const changes: ChangeInput[] = [];
        // Another item may have added the same song while this one was downloading.
        const duplicate = await songsDb.findExisting(tx, { source: body.source.source, sourceId: body.source.sourceId, isrc: body.isrc });
        let finalSongId = duplicate?.id;
        if (!finalSongId) {
          const song = await songsDb.insert(tx, {
            id: songId,
            title: body.title,
            artist: body.artist,
            album: body.album,
            albumArtist: body.albumArtist,
            year: body.year,
            genre: body.genre,
            trackNumber: body.trackNumber,
            discNumber: body.discNumber,
            isrc: body.isrc,
            durationMs: body.durationMs,
            source: body.source.source,
            sourceId: body.source.sourceId,
            sourceUrl: body.source.sourceUrl,
            audioKey,
            audioCodec: body.audio.codec,
            audioBitrateKbps: body.audio.bitrateKbps,
            audioSizeBytes: body.audio.sizeBytes,
            audioSha256: body.audio.sha256,
            coverKey,
            coverColor: coverKey ? (body.cover?.color ?? null) : null,
            lyricsPlain: body.lyrics?.plain ?? null,
            lyricsSynced: body.lyrics?.synced ?? null,
            loudnessLufs: body.loudness?.lufs ?? null,
            gainDb: body.loudness?.gainDb ?? null,
            path: await chooseSongPath(tx, { id: songId, title: body.title, artist: body.artist, albumArtist: body.albumArtist, codec: body.audio.codec }),
          });
          changes.push({ entity: 'song', entityId: song.id, op: 'upsert' });
          finalSongId = song.id;
        }

        const link = await linkToPlaylist(tx, download, item, finalSongId);
        if (link) changes.push(link);
        const finished = await itemsDb.update(tx, itemId, {
          status: duplicate ? 'skipped' : 'completed',
          stage: null,
          songId: finalSongId,
          error: duplicate ? ALREADY_IN_LIBRARY : null,
          title: body.title,
          artist: body.artist,
          finishedAt: new Date(),
        });
        const refreshed = await refreshDownloadStatus(tx, download);
        return { outcome: 'done' as const, item: finished, duplicate: Boolean(duplicate), ...refreshed, cursor: await recordChanges(tx, changes) };
      });

      if (result.outcome === 'repeat') return { songId: result.songId };
      if (result.outcome === 'gone') {
        await storage.remove(storageKeys.allForSong(songId));
        throw new ConflictError(`Item is ${result.status}`);
      }

      publish(result);
      if (result.duplicate) await storage.remove(storageKeys.allForSong(songId));
      await releaseInput(result.item);
      return { songId: result.item.songId ?? songId };
    },

    async failItem(itemId: string, body: ItemFail): Promise<void> {
      const result = await db.transaction(async (tx) => {
        const { item, download } = await lockItemWithDownload(tx, itemId);
        if (FINISHED_ITEM_STATUSES.includes(item.status)) return null;
        // Not final: the job will run again after a delay, so the item goes back to queued.
        const updated = await itemsDb.update(
          tx,
          itemId,
          body.final ? { status: 'failed', stage: null, error: body.error, finishedAt: new Date() } : { status: 'queued', stage: null, error: body.error },
        );
        return { item: updated, ...(await refreshDownloadStatus(tx, download)) };
      });
      if (!result) return;
      publish(result);
      if (body.final && result.item.pendingSongId) await storage.remove(storageKeys.allForSong(result.item.pendingSongId));
    },
  };
}

export type WorkerJobService = ReturnType<typeof createWorkerJobService>;

// One item per unique link, at the place it first appears. Videos already in the
// library are skipped straight away.
async function planEntries(tx: Transaction, entries: readonly ResolvedEntry[]): Promise<ItemPlan[]> {
  const byUrl = new Map<string, { entry: ResolvedEntry; parsed: ParsedSourceUrl | null }>();
  for (const entry of entries) {
    const parsed = parseSourceUrl(entry.url);
    const url = parsed?.url ?? entry.url;
    if (!byUrl.has(url)) byUrl.set(url, { entry, parsed });
  }
  const unique = [...byUrl.values()];
  const youtubeIds = unique.flatMap(({ parsed }) => (parsed?.source === 'youtube' && parsed.sourceId ? [parsed.sourceId] : []));
  const songIdByVideo = new Map((await songsDb.findBySourceIds(tx, 'youtube', youtubeIds)).map((song) => [song.sourceId, song.id]));

  return unique.map(({ entry, parsed }) => ({
    input: { kind: 'url', url: parsed?.url ?? entry.url },
    title: entry.title,
    artist: entry.artist,
    existingSongId: (parsed?.sourceId && songIdByVideo.get(parsed.sourceId)) || null,
  }));
}
