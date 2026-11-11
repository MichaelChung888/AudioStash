import { randomUUID } from 'node:crypto';
import { type CreateDownloadRequest, createDownloadSchema } from '@pluck/contracts';
import { downloadItems, outbox, playlistEntries } from '@pluck/db';
import { asc, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { BadRequestError, ConflictError, NotFoundError } from '../lib/errors.ts';
import { startTestDatabase, type TestDatabase } from '../testing/database.ts';
import { fakeNotifier, fakeRelay, insertSong, MemoryStorage } from '../testing/fakes.ts';
import { createDownloadService, type DownloadService } from './downloads.ts';

const VIDEO_ID = 'dQw4w9WgXcQ';

let database: TestDatabase;
let storage: MemoryStorage;
let relay: ReturnType<typeof fakeRelay>;
let downloads: DownloadService;

beforeAll(async () => {
  database = await startTestDatabase();
});

afterAll(async () => {
  await database?.stop();
});

beforeEach(async () => {
  await database.reset();
  storage = new MemoryStorage();
  relay = fakeRelay();
  downloads = createDownloadService({ db: database.db, storage, notifier: fakeNotifier(), relay });
});

const create = (request: Omit<CreateDownloadRequest, 'id'> & { id?: string }) => downloads.create(createDownloadSchema.parse({ id: randomUUID(), ...request }));
const jobs = () => database.db.select({ job: outbox.job, payload: outbox.payload }).from(outbox).orderBy(asc(outbox.id));
const tracks = (...titles: string[]) => ({ kind: 'catalog' as const, tracks: titles.map((title) => ({ title, artist: 'Artist' })) });

describe('creating downloads', () => {
  it('queues one item and one job for a single link', async () => {
    const { detail, created } = await create({ source: { kind: 'url', url: `https://youtu.be/${VIDEO_ID}` } });

    expect(created).toBe(true);
    expect(detail).toMatchObject({ status: 'queued', sourceUrl: `https://www.youtube.com/watch?v=${VIDEO_ID}`, counts: { total: 1 } });
    expect(detail.items).toEqual([expect.objectContaining({ status: 'queued', position: 0 })]);
    await expect(jobs()).resolves.toEqual([{ job: 'download.item', payload: { downloadId: detail.id, itemId: detail.items[0]?.id } }]);
    expect(relay.kick).toHaveBeenCalled();
  });

  it('returns the first result when the same id is sent again', async () => {
    const id = randomUUID();
    const first = await create({ id, source: { kind: 'url', url: `https://youtu.be/${VIDEO_ID}` } });
    const second = await create({ id, source: { kind: 'url', url: `https://youtu.be/${VIDEO_ID}` } });

    expect(second.created).toBe(false);
    expect(second.detail.items.map((i) => i.id)).toEqual(first.detail.items.map((i) => i.id));
    await expect(jobs()).resolves.toHaveLength(1);
  });

  it('asks the worker to resolve a playlist link first', async () => {
    const { detail } = await create({ source: { kind: 'url', url: 'https://www.youtube.com/playlist?list=PL123abc' } });

    expect(detail).toMatchObject({ status: 'resolving', items: [] });
    await expect(jobs()).resolves.toEqual([{ job: 'download.resolve', payload: { downloadId: detail.id } }]);
  });

  it('rejects links it cannot download', async () => {
    await expect(create({ source: { kind: 'url', url: 'https://www.youtube.com/watch?v=short' } })).rejects.toBeInstanceOf(BadRequestError);
  });

  it('skips a song already in the library and still adds it to the target playlist', async () => {
    const song = await insertSong(database.db, { sourceId: VIDEO_ID });
    const playlistId = randomUUID();

    const { detail } = await create({ source: { kind: 'url', url: `https://youtu.be/${VIDEO_ID}` }, target: { kind: 'newPlaylist', playlistId, name: 'Mix' } });

    expect(detail).toMatchObject({ status: 'completed', counts: { skipped: 1 } });
    expect(detail.items).toEqual([expect.objectContaining({ status: 'skipped', songId: song.id })]);
    await expect(jobs()).resolves.toEqual([]);
    const entries = await database.db.select().from(playlistEntries).where(eq(playlistEntries.playlistId, playlistId));
    expect(entries).toEqual([expect.objectContaining({ songId: song.id })]);
  });

  it('reserves playlist positions in the order of the source', async () => {
    const playlistId = randomUUID();
    const { detail } = await create({ source: tracks('One', 'Two', 'Three'), target: { kind: 'newPlaylist', playlistId } });

    const rows = await database.db
      .select({ title: downloadItems.title, playlistPosition: downloadItems.playlistPosition })
      .from(downloadItems)
      .where(eq(downloadItems.downloadId, detail.id))
      .orderBy(asc(downloadItems.position));
    const positions = rows.map((r) => r.playlistPosition ?? '');
    expect(rows.map((r) => r.title)).toEqual(['One', 'Two', 'Three']);
    expect([...positions].sort()).toEqual(positions);
    expect(new Set(positions).size).toBe(3);
  });

  it('refuses a target playlist that does not exist', async () => {
    await expect(create({ source: tracks('One'), target: { kind: 'playlist', playlistId: randomUUID() } })).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('cancel, retry and remove', () => {
  it('cancels open items, then queues them again on retry', async () => {
    const { detail } = await create({ source: tracks('One', 'Two') });

    const cancelled = await downloads.cancel(detail.id);
    expect(cancelled).toMatchObject({ status: 'cancelled', counts: { cancelled: 2 } });

    const retried = await downloads.retry(detail.id);
    expect(retried).toMatchObject({ status: 'queued', counts: { cancelled: 0 } });
    await expect(jobs()).resolves.toHaveLength(4);
  });

  it('will not retry a download that is still running', async () => {
    const { detail } = await create({ source: tracks('One') });
    await expect(downloads.retry(detail.id)).rejects.toBeInstanceOf(ConflictError);
  });

  it('removes only finished downloads, and deletes their uploaded files', async () => {
    const key = `incoming/${randomUUID()}/song.mp3`;
    storage.put(key, 5_000);
    const { detail } = await create({ source: { kind: 'upload', files: [{ key, filename: 'song.mp3' }] } });
    expect(detail.title).toBe('song');

    await expect(downloads.remove(detail.id)).rejects.toBeInstanceOf(ConflictError);
    await downloads.cancel(detail.id);
    await downloads.remove(detail.id);

    await expect(downloads.get(detail.id)).rejects.toBeInstanceOf(NotFoundError);
    expect(storage.objects.has(key)).toBe(false);
  });
});
