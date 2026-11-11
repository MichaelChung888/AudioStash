import type { CreateDownload, Download, DownloadDetail, DownloadSource, ListDownloadsQuery } from '@pluck/contracts';
import { parseSourceUrl } from '@pluck/core';
import type { Database, Transaction } from '@pluck/db';
import { type ChangeInput, recordChanges } from '../db/changes.ts';
import type { DownloadRow } from '../db/downloads.ts';
import * as downloadsDb from '../db/downloads.ts';
import * as itemsDb from '../db/items.ts';
import { toDownload, toItem } from '../db/mappers.ts';
import * as outboxDb from '../db/outbox.ts';
import * as playlistsDb from '../db/playlists.ts';
import * as songsDb from '../db/songs.ts';
import { BadRequestError, ConflictError, NotFoundError } from '../lib/errors.ts';
import { addItems, type ItemPlan } from './download-items.ts';
import { isFinished, refreshDownloadStatus } from './download-status.ts';
import type { Notifier } from './notifier.ts';
import type { Storage } from './storage.ts';

interface Deps {
  db: Database;
  storage: Storage;
  notifier: Notifier;
  relay: { kick(): void };
}

interface SourcePlan {
  title: string;
  sourceUrl: string | null;
  // Playlist and album links are expanded into items by the worker first.
  resolving: boolean;
  items: ItemPlan[];
}

export function createDownloadService({ db, storage, notifier, relay }: Deps) {
  async function loadDetail(executor: Database | Transaction, download: DownloadRow): Promise<DownloadDetail> {
    const items = await itemsDb.listByDownload(executor, download.id);
    const counts = await itemsDb.countByDownload(executor, [download.id]);
    return { ...toDownload(download, counts.get(download.id) ?? itemsDb.emptyCounts()), items: items.map(toItem) };
  }

  async function findOrThrow(id: string): Promise<DownloadRow> {
    const download = await downloadsDb.findById(db, id);
    if (!download) throw new NotFoundError('Download not found');
    return download;
  }

  return {
    // Idempotent on the client-chosen id: sending the same request twice returns the first result.
    async create(input: CreateDownload): Promise<{ detail: DownloadDetail; created: boolean }> {
      const result = await db.transaction(async (tx) => {
        const existing = await downloadsDb.findById(tx, input.id);
        if (existing) return { created: false, detail: await loadDetail(tx, existing), cursor: null };

        const changes: ChangeInput[] = [];
        const target = await createTarget(tx, input, changes);
        const plan = await planSource(tx, input.source);

        const download = await downloadsDb.insert(tx, {
          id: input.id,
          title: plan.title,
          sourceKind: input.source.kind,
          sourceUrl: plan.sourceUrl,
          options: input.options,
          playlistId: target.playlistId,
          namePlaylistFromSource: target.nameFromSource,
          status: plan.resolving ? 'resolving' : 'queued',
        });
        if (plan.resolving) await outboxDb.enqueue(tx, [{ job: 'download.resolve', payload: { downloadId: download.id } }]);

        const added = await addItems(tx, download, plan.items);
        changes.push(...added.changes);
        const { download: refreshed } = await refreshDownloadStatus(tx, download);
        const detail = await loadDetail(tx, refreshed);
        const cursor = await recordChanges(tx, changes);
        return { created: true, detail, cursor };
      });

      if (result.created) {
        relay.kick();
        notifier.downloadChanged(stripItems(result.detail));
        notifier.libraryChanged(result.cursor);
      }
      return { detail: result.detail, created: result.created };
    },

    async list(query: ListDownloadsQuery): Promise<Download[]> {
      const rows = await downloadsDb.list(db, { status: query.status, limit: query.limit, before: query.before ? new Date(query.before) : undefined });
      const counts = await itemsDb.countByDownload(
        db,
        rows.map((r) => r.id),
      );
      return rows.map((row) => toDownload(row, counts.get(row.id) ?? itemsDb.emptyCounts()));
    },

    async get(id: string): Promise<DownloadDetail> {
      return loadDetail(db, await findOrThrow(id));
    },

    // Items already being processed are marked cancelled too. The worker finds out
    // at its next report to the API and stops.
    async cancel(id: string): Promise<Download> {
      const detail = await db.transaction(async (tx) => {
        const download = await downloadsDb.lockById(tx, id);
        if (!download) throw new NotFoundError('Download not found');
        if (download.status === 'cancelled') return loadDetail(tx, download);
        if (isFinished(download.status)) throw new ConflictError('This download has already finished');

        const now = new Date();
        await itemsDb.updateWhereStatus(tx, id, ['queued', 'active'], { status: 'cancelled', stage: null, finishedAt: now });
        return loadDetail(tx, await downloadsDb.update(tx, id, { status: 'cancelled', finishedAt: now }));
      });
      const download = stripItems(detail);
      notifier.downloadChanged(download);
      return download;
    },

    // Queues failed and cancelled items again. A playlist link that failed to
    // resolve is resolved again.
    async retry(id: string): Promise<Download> {
      const detail = await db.transaction(async (tx) => {
        const download = await downloadsDb.lockById(tx, id);
        if (!download) throw new NotFoundError('Download not found');
        if (!isFinished(download.status)) throw new ConflictError('This download is still running');

        const reset = { error: null, finishedAt: null };
        const counts = (await itemsDb.countByDownload(tx, [id])).get(id) ?? itemsDb.emptyCounts();
        if (counts.total === 0 && download.sourceKind === 'url') {
          await outboxDb.enqueue(tx, [{ job: 'download.resolve', payload: { downloadId: id } }]);
          return loadDetail(tx, await downloadsDb.update(tx, id, { ...reset, status: 'resolving' }));
        }

        const requeued = await itemsDb.updateWhereStatus(tx, id, ['failed', 'cancelled'], {
          ...reset,
          status: 'queued',
          stage: null,
          attempts: 0,
          workerId: null,
          claimedAt: null,
        });
        if (requeued.length === 0) throw new ConflictError('There is nothing to retry');
        await outboxDb.enqueue(
          tx,
          requeued.map((item) => ({ job: 'download.item', payload: { downloadId: id, itemId: item.id } })),
        );
        const reopened = await downloadsDb.update(tx, id, { ...reset, status: 'queued' });
        return loadDetail(tx, (await refreshDownloadStatus(tx, reopened)).download);
      });
      relay.kick();
      const download = stripItems(detail);
      notifier.downloadChanged(download);
      return download;
    },

    // Removes a finished download from the list. Songs it added stay in the library.
    async remove(id: string): Promise<void> {
      const uploadKeys = await db.transaction(async (tx) => {
        const download = await downloadsDb.lockById(tx, id);
        if (!download) throw new NotFoundError('Download not found');
        if (!isFinished(download.status)) throw new ConflictError('Cancel the download before removing it');
        const items = await itemsDb.listByDownload(tx, id);
        await downloadsDb.remove(tx, id);
        return items.flatMap((item) => (item.input.kind === 'upload' ? [item.input.key] : []));
      });
      await storage.remove(uploadKeys);
    },
  };
}

export type DownloadService = ReturnType<typeof createDownloadService>;

function stripItems({ items: _items, ...download }: DownloadDetail): Download {
  return download;
}

async function createTarget(tx: Transaction, input: CreateDownload, changes: ChangeInput[]): Promise<{ playlistId: string | null; nameFromSource: boolean }> {
  const { target, source } = input;
  switch (target.kind) {
    case 'library':
      return { playlistId: null, nameFromSource: false };
    case 'playlist': {
      if (!(await playlistsDb.findById(tx, target.playlistId))) throw new NotFoundError('Playlist not found');
      return { playlistId: target.playlistId, nameFromSource: false };
    }
    case 'newPlaylist': {
      const created = await playlistsDb.insert(tx, {
        id: target.playlistId,
        name: target.name ?? (source.kind === 'url' ? 'Imported playlist' : 'New playlist'),
        sourceUrl: source.kind === 'url' ? source.url : null,
      });
      // Already exists when the phone created it offline and synced it before this request.
      if (!created) return { playlistId: target.playlistId, nameFromSource: false };
      changes.push({ entity: 'playlist', entityId: created.id, op: 'upsert' });
      return { playlistId: created.id, nameFromSource: !target.name && source.kind === 'url' };
    }
  }
}

async function planSource(tx: Transaction, source: DownloadSource): Promise<SourcePlan> {
  switch (source.kind) {
    case 'url': {
      const parsed = parseSourceUrl(source.url);
      if (!parsed) throw new BadRequestError('This link is not supported. Paste a YouTube, SoundCloud or Bandcamp link.');
      if (parsed.kind !== 'track') return { title: parsed.url, sourceUrl: parsed.url, resolving: true, items: [] };

      const existing = parsed.sourceId ? await songsDb.findExisting(tx, { source: parsed.source, sourceId: parsed.sourceId, isrc: null }) : null;
      return {
        // Replaced by the video's title once the worker reports it.
        title: parsed.url,
        sourceUrl: parsed.url,
        resolving: false,
        items: [{ input: { kind: 'url', url: parsed.url }, title: parsed.url, artist: null, existingSongId: existing?.id ?? null }],
      };
    }

    case 'catalog': {
      const owned = await songsDb.findByIsrcs(
        tx,
        source.tracks.flatMap((t) => (t.isrc ? [t.isrc] : [])),
      );
      const songIdByIsrc = new Map(owned.map((s) => [s.isrc, s.id]));
      return {
        title: summarize(source.tracks.map((t) => t.title)),
        sourceUrl: null,
        resolving: false,
        items: source.tracks.map((hint) => ({
          input: { kind: 'catalog', hint },
          title: hint.title,
          artist: hint.artist,
          existingSongId: (hint.isrc && songIdByIsrc.get(hint.isrc)) || null,
        })),
      };
    }

    case 'upload':
      return {
        title: summarize(source.files.map((f) => stripExtension(f.filename))),
        sourceUrl: null,
        resolving: false,
        items: source.files.map((file) => ({
          input: { kind: 'upload', key: file.key, filename: file.filename },
          title: stripExtension(file.filename),
          artist: null,
          existingSongId: null,
        })),
      };
  }
}

function summarize(titles: readonly string[]): string {
  const [first = 'Download'] = titles;
  return titles.length > 1 ? `${first} and ${titles.length - 1} more` : first;
}

function stripExtension(filename: string): string {
  return filename.replace(/\.[^.]+$/, '') || filename;
}
