import { randomUUID } from 'node:crypto';
import type { Mutation } from '@pluck/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startTestDatabase, type TestDatabase } from '../testing/database.ts';
import { fakeNotifier, insertSong, MemoryStorage } from '../testing/fakes.ts';
import { createSyncService, type SyncService } from './sync.ts';

let database: TestDatabase;
let storage: MemoryStorage;
let sync: SyncService;
const sessionId = 'sess_test';

beforeAll(async () => {
  database = await startTestDatabase();
});

afterAll(async () => {
  await database?.stop();
});

beforeEach(async () => {
  await database.reset();
  storage = new MemoryStorage();
  sync = createSyncService({ db: database.db, storage, notifier: fakeNotifier() });
});

function mutation<T extends Mutation['type']>(type: T, payload: Extract<Mutation, { type: T }>['payload']): Mutation {
  return { id: randomUUID(), type, payload, createdAt: new Date().toISOString() } as Mutation;
}

const statuses = async (mutations: Mutation[]) => (await sync.push(sessionId, mutations)).results.map((r) => r.status);

describe('sync', () => {
  it('applies mutations in order and pulls each changed row once, in its latest state', async () => {
    const song = await insertSong(database.db);
    const playlistId = randomUUID();
    const entryId = randomUUID();

    await expect(
      statuses([
        mutation('playlist.create', { playlistId, name: 'Gym' }),
        mutation('playlist.addSongs', { playlistId, entries: [{ entryId, songId: song.id, position: 'a0' }] }),
        mutation('playlist.update', { playlistId, name: 'Gym 2026' }),
      ]),
    ).resolves.toEqual(['applied', 'applied', 'applied']);

    const pulled = await sync.pull({ cursor: 0, limit: 100 });
    expect(pulled.hasMore).toBe(false);
    expect(pulled.changes).toEqual([
      expect.objectContaining({ type: 'entry.upserted', data: expect.objectContaining({ id: entryId, songId: song.id }) }),
      expect.objectContaining({ type: 'playlist.upserted', data: expect.objectContaining({ id: playlistId, name: 'Gym 2026' }) }),
    ]);
  });

  it('applies a resent mutation once', async () => {
    const create = mutation('playlist.create', { playlistId: randomUUID(), name: 'Once' });
    await expect(statuses([create])).resolves.toEqual(['applied']);
    await expect(statuses([create])).resolves.toEqual(['duplicate']);
    expect((await sync.pull({ cursor: 0, limit: 100 })).changes).toHaveLength(1);
  });

  it('applies a mutation once when the same batch is sent twice at the same time', async () => {
    const create = mutation('playlist.create', { playlistId: randomUUID(), name: 'Race' });
    const [a, b] = await Promise.all([sync.push(sessionId, [create]), sync.push(sessionId, [create])]);
    expect([a.results[0]?.status, b.results[0]?.status].sort()).toEqual(['applied', 'duplicate']);
  });

  it('rejects a mutation that no longer applies and carries on with the rest', async () => {
    await expect(
      statuses([
        mutation('playlist.update', { playlistId: randomUUID(), name: 'Gone' }),
        mutation('playlist.create', { playlistId: randomUUID(), name: 'New' }),
      ]),
    ).resolves.toEqual(['rejected', 'applied']);
  });

  it('pages through the change log with the cursor', async () => {
    await statuses(['A', 'B', 'C'].map((name) => mutation('playlist.create', { playlistId: randomUUID(), name })));

    const first = await sync.pull({ cursor: 0, limit: 2 });
    expect(first).toMatchObject({ hasMore: true });
    expect(first.changes).toHaveLength(2);

    const second = await sync.pull({ cursor: first.cursor, limit: 2 });
    expect(second).toMatchObject({ hasMore: false });
    expect(second.changes.map((c) => c.type === 'playlist.upserted' && c.data.name)).toEqual(['C']);
  });

  it('sends a delete for every entry of a deleted playlist', async () => {
    const song = await insertSong(database.db);
    const playlistId = randomUUID();
    const entryId = randomUUID();
    await statuses([
      mutation('playlist.create', { playlistId, name: 'Temp' }),
      mutation('playlist.addSongs', { playlistId, entries: [{ entryId, songId: song.id, position: 'a0' }] }),
    ]);
    const { cursor } = await sync.pull({ cursor: 0, limit: 100 });

    await statuses([mutation('playlist.delete', { playlistId })]);

    const { changes } = await sync.pull({ cursor, limit: 100 });
    expect(changes).toEqual([
      expect.objectContaining({ type: 'entry.deleted', id: entryId }),
      expect.objectContaining({ type: 'playlist.deleted', id: playlistId }),
    ]);
  });

  it('tells the phone to drop entries whose song does not exist', async () => {
    const playlistId = randomUUID();
    const entryId = randomUUID();
    await statuses([
      mutation('playlist.create', { playlistId, name: 'P' }),
      mutation('playlist.addSongs', { playlistId, entries: [{ entryId, songId: randomUUID(), position: 'a0' }] }),
    ]);

    const { changes } = await sync.pull({ cursor: 0, limit: 100 });
    expect(changes).toContainEqual(expect.objectContaining({ type: 'entry.deleted', id: entryId }));
  });

  it('deletes a song with its entries and its files', async () => {
    const song = await insertSong(database.db, { coverKey: 'songs/x/cover.jpg' });
    storage.put(song.audioKey, 1_000);
    storage.put('songs/x/cover.jpg', 10);
    const playlistId = randomUUID();
    const entryId = randomUUID();
    await statuses([
      mutation('playlist.create', { playlistId, name: 'P' }),
      mutation('playlist.addSongs', { playlistId, entries: [{ entryId, songId: song.id, position: 'a0' }] }),
    ]);
    const { cursor } = await sync.pull({ cursor: 0, limit: 100 });

    await statuses([mutation('song.delete', { songId: song.id })]);

    expect(storage.objects.size).toBe(0);
    const { changes } = await sync.pull({ cursor, limit: 100 });
    expect(changes).toEqual([expect.objectContaining({ type: 'entry.deleted', id: entryId }), expect.objectContaining({ type: 'song.deleted', id: song.id })]);
  });

  it('moves a song to a new folder when its artist changes', async () => {
    const song = await insertSong(database.db, { title: 'Song', artist: 'Old Name', path: 'Songs/Old Name/Song.opus' });

    await statuses([mutation('song.update', { songId: song.id, patch: { artist: 'New Name' } })]);

    const { changes } = await sync.pull({ cursor: 0, limit: 100 });
    expect(changes).toEqual([
      expect.objectContaining({ type: 'song.upserted', data: expect.objectContaining({ artist: 'New Name', path: 'Songs/New Name/Song.opus' }) }),
    ]);
  });
});
