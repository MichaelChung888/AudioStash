import { randomUUID } from 'node:crypto';
import { type CreateDownloadRequest, createDownloadSchema, type ItemComplete } from '@pluck/contracts';
import { libraryChanges, outbox, playlistEntries, playlists, songs } from '@pluck/db';
import { asc, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { BadRequestError, ConflictError } from '../lib/errors.ts';
import { startTestDatabase, type TestDatabase } from '../testing/database.ts';
import { fakeNotifier, fakeRelay, insertSong, MemoryStorage } from '../testing/fakes.ts';
import { createDownloadService, type DownloadService } from './downloads.ts';
import { createWorkerJobService, type WorkerJobService } from './worker-jobs.ts';

const CLAIM = { workerId: 'test-pc', attempt: 1 };

let database: TestDatabase;
let storage: MemoryStorage;
let downloads: DownloadService;
let worker: WorkerJobService;

beforeAll(async () => {
  database = await startTestDatabase();
});

afterAll(async () => {
  await database?.stop();
});

beforeEach(async () => {
  await database.reset();
  storage = new MemoryStorage();
  const deps = { db: database.db, storage, notifier: fakeNotifier(), relay: fakeRelay() };
  downloads = createDownloadService(deps);
  worker = createWorkerJobService(deps);
});

const create = async (request: Omit<CreateDownloadRequest, 'id'>) =>
  (await downloads.create(createDownloadSchema.parse({ id: randomUUID(), ...request }))).detail;
const tracks = (...titles: string[]) => ({ kind: 'catalog' as const, tracks: titles.map((title) => ({ title, artist: 'Artist' })) });

function completion(videoId: string, overrides: Partial<ItemComplete> = {}): ItemComplete {
  return {
    source: { source: 'youtube', sourceId: videoId, sourceUrl: `https://www.youtube.com/watch?v=${videoId}` },
    title: `Song ${videoId}`,
    artist: 'Artist',
    album: null,
    albumArtist: null,
    year: null,
    genre: null,
    trackNumber: null,
    discNumber: null,
    isrc: null,
    durationMs: 200_000,
    audio: { codec: 'opus', bitrateKbps: 160, sizeBytes: 4_000, sha256: 'b'.repeat(64) },
    cover: null,
    lyrics: null,
    loudness: null,
    ...overrides,
  };
}

// What the worker does for one item, up to the point of reporting it complete.
async function processUpTo(itemId: string, videoId: string, overrides: Partial<ItemComplete> = {}) {
  const body = completion(videoId, overrides);
  expect(await worker.claimItem(itemId, CLAIM)).toMatchObject({ status: 'proceed' });
  const source = await worker.reportSource(itemId, { ...body.source, isrc: body.isrc, title: body.title, artist: body.artist });
  expect(source).toMatchObject({ status: 'proceed' });
  const urls = await worker.uploadUrls(itemId, { codec: body.audio.codec, hasCover: body.cover !== null });
  storage.put(urls.audio.key, body.audio.sizeBytes);
  if (urls.cover) storage.put(urls.cover.key, 100);
  return body;
}

async function processItem(itemId: string, videoId: string, overrides: Partial<ItemComplete> = {}) {
  return worker.completeItem(itemId, await processUpTo(itemId, videoId, overrides));
}

const entriesOf = (playlistId: string) =>
  database.db
    .select({ songId: playlistEntries.songId, title: songs.title })
    .from(playlistEntries)
    .innerJoin(songs, eq(songs.id, playlistEntries.songId))
    .where(eq(playlistEntries.playlistId, playlistId))
    .orderBy(asc(playlistEntries.position));

describe('item jobs', () => {
  it('takes a single link from queued to a song in the library and the playlist', async () => {
    const playlistId = randomUUID();
    const download = await create({ source: { kind: 'url', url: 'https://youtu.be/aaaaaaaaaaa' }, target: { kind: 'newPlaylist', playlistId, name: 'Mix' } });
    const itemId = download.items[0]?.id ?? '';

    const { songId } = await processItem(itemId, 'aaaaaaaaaaa', { cover: { color: '#112233' } });

    const song = await database.db.query.songs.findFirst({ where: eq(songs.id, songId) });
    expect(song).toMatchObject({
      title: 'Song aaaaaaaaaaa',
      path: 'Songs/Artist/Song aaaaaaaaaaa.opus',
      coverKey: `songs/${songId}/cover.jpg`,
      coverColor: '#112233',
    });
    await expect(downloads.get(download.id)).resolves.toMatchObject({
      title: 'Song aaaaaaaaaaa',
      status: 'completed',
      items: [expect.objectContaining({ status: 'completed', songId })],
    });
    await expect(entriesOf(playlistId)).resolves.toEqual([{ songId, title: 'Song aaaaaaaaaaa' }]);
    const changes = await database.db.select({ entity: libraryChanges.entity, op: libraryChanges.op }).from(libraryChanges);
    expect(changes).toEqual(expect.arrayContaining([expect.objectContaining({ entity: 'song' }), expect.objectContaining({ entity: 'entry' })]));
  });

  it('treats a repeated completion as done', async () => {
    const download = await create({ source: tracks('One') });
    const itemId = download.items[0]?.id ?? '';
    const body = await processUpTo(itemId, 'bbbbbbbbbbb');

    const first = await worker.completeItem(itemId, body);
    await expect(worker.completeItem(itemId, body)).resolves.toEqual(first);
  });

  it('skips the download when the reported source is already in the library', async () => {
    const existing = await insertSong(database.db, { sourceId: 'ccccccccccc' });
    const download = await create({ source: tracks('One') });
    const itemId = download.items[0]?.id ?? '';

    await worker.claimItem(itemId, CLAIM);
    await expect(worker.reportSource(itemId, { source: 'youtube', sourceId: 'ccccccccccc', sourceUrl: null, isrc: null })).resolves.toEqual({
      status: 'duplicate',
      songId: existing.id,
    });
    await expect(downloads.get(download.id)).resolves.toMatchObject({ status: 'completed', items: [expect.objectContaining({ status: 'skipped' })] });
  });

  it('refuses a completion whose audio upload is missing or the wrong size', async () => {
    const download = await create({ source: tracks('One') });
    const itemId = download.items[0]?.id ?? '';
    const body = await processUpTo(itemId, 'ddddddddddd');

    await expect(worker.completeItem(itemId, { ...body, audio: { ...body.audio, sizeBytes: 999 } })).rejects.toBeInstanceOf(BadRequestError);
    storage.objects.clear();
    await expect(worker.completeItem(itemId, body)).rejects.toBeInstanceOf(BadRequestError);
  });

  it('answers a conflict for an item cancelled mid-download, and deletes its uploads', async () => {
    const download = await create({ source: tracks('One') });
    const itemId = download.items[0]?.id ?? '';
    const body = await processUpTo(itemId, 'eeeeeeeeeee');

    await downloads.cancel(download.id);

    await expect(worker.setStage(itemId, 'processing')).rejects.toBeInstanceOf(ConflictError);
    await expect(worker.completeItem(itemId, body)).rejects.toBeInstanceOf(ConflictError);
    expect(storage.objects.size).toBe(0);
    await expect(worker.claimItem(itemId, CLAIM)).resolves.toMatchObject({ status: 'skip' });
  });

  it('puts a failed attempt back in the queue and fails the download after the last one', async () => {
    const download = await create({ source: tracks('One') });
    const itemId = download.items[0]?.id ?? '';

    await worker.claimItem(itemId, CLAIM);
    await worker.failItem(itemId, { error: 'network', final: false });
    await expect(downloads.get(download.id)).resolves.toMatchObject({
      status: 'queued',
      items: [expect.objectContaining({ status: 'queued', error: 'network' })],
    });

    await worker.claimItem(itemId, { ...CLAIM, attempt: 2 });
    await worker.failItem(itemId, { error: 'video unavailable', final: true });
    await expect(downloads.get(download.id)).resolves.toMatchObject({ status: 'failed', items: [expect.objectContaining({ status: 'failed' })] });
  });

  it('completes the download when its last two items finish at the same moment', async () => {
    const download = await create({ source: tracks('One', 'Two') });
    const [first, second] = download.items.map((item) => item.id);
    const bodies = await Promise.all([processUpTo(first ?? '', 'fffffffffff'), processUpTo(second ?? '', 'ggggggggggg')]);

    await Promise.all([worker.completeItem(first ?? '', bodies[0]), worker.completeItem(second ?? '', bodies[1])]);

    await expect(downloads.get(download.id)).resolves.toMatchObject({ status: 'completed', counts: { completed: 2 } });
  });

  it('skips jobs for items that no longer exist', async () => {
    await expect(worker.claimItem(randomUUID(), CLAIM)).resolves.toMatchObject({ status: 'skip' });
  });
});

describe('resolve jobs', () => {
  it('adds one item per unique link and names the new playlist after the source', async () => {
    const playlistId = randomUUID();
    const download = await create({
      source: { kind: 'url', url: 'https://www.youtube.com/playlist?list=PL123abc' },
      target: { kind: 'newPlaylist', playlistId },
    });
    const entry = (videoId: string, title: string) => ({ url: `https://www.youtube.com/watch?v=${videoId}`, title, artist: 'Artist', durationSec: 200 });

    await expect(worker.claimResolve(download.id)).resolves.toMatchObject({ status: 'proceed' });
    await worker.completeResolve(download.id, {
      title: 'Road Trip',
      entries: [entry('hhhhhhhhhhh', 'First'), entry('iiiiiiiiiii', 'Second'), { ...entry('hhhhhhhhhhh', 'First again'), url: 'https://youtu.be/hhhhhhhhhhh' }],
    });

    const detail = await downloads.get(download.id);
    expect(detail).toMatchObject({ title: 'Road Trip', status: 'queued' });
    expect(detail.items.map((i) => i.title)).toEqual(['First', 'Second']);
    await expect(database.db.select({ name: playlists.name }).from(playlists)).resolves.toEqual([{ name: 'Road Trip' }]);
    await expect(database.db.select({ job: outbox.job }).from(outbox).where(eq(outbox.job, 'download.item'))).resolves.toHaveLength(2);

    // Finishing out of order still gives the playlist the source order.
    const [first, second] = detail.items.map((item) => item.id);
    await processItem(second ?? '', 'iiiiiiiiiii', { title: 'Second' });
    await processItem(first ?? '', 'hhhhhhhhhhh', { title: 'First' });
    await expect(entriesOf(playlistId)).resolves.toEqual([expect.objectContaining({ title: 'First' }), expect.objectContaining({ title: 'Second' })]);

    await expect(worker.claimResolve(download.id)).resolves.toMatchObject({ status: 'skip' });
  });

  it('fails the download when the link has no songs', async () => {
    const download = await create({ source: { kind: 'url', url: 'https://www.youtube.com/playlist?list=PLempty' } });

    await worker.completeResolve(download.id, { title: 'Empty', entries: [] });

    await expect(downloads.get(download.id)).resolves.toMatchObject({ status: 'failed', error: 'No songs found at this link' });
  });
});
