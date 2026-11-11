import type { Change, Mutation, PullQuery, PullResponse, PushResponse } from '@pluck/contracts';
import type { Database, Transaction } from '@pluck/db';
import * as changesDb from '../db/changes.ts';
import { type ChangeInput, recordChanges } from '../db/changes.ts';
import * as entriesDb from '../db/entries.ts';
import { toEntry, toPlaylist, toSong } from '../db/mappers.ts';
import * as mutationsDb from '../db/mutations.ts';
import * as playlistsDb from '../db/playlists.ts';
import * as songsDb from '../db/songs.ts';
import { isUniqueViolation } from '../lib/pg-errors.ts';
import type { Notifier } from './notifier.ts';
import { chooseSongPath } from './song-paths.ts';
import type { Storage } from './storage.ts';

interface Deps {
  db: Database;
  storage: Storage;
  notifier: Notifier;
}

type MutationResult = PushResponse['results'][number];

interface Applied {
  changes: ChangeInput[];
  // Bucket objects to delete once the transaction has committed.
  removeKeys: string[];
}

// The mutation cannot be applied, for example the playlist it edits was deleted on
// another phone. The phone drops it and pulls the server's state.
class MutationRejected extends Error {
  override name = 'MutationRejected';
}

export function createSyncService({ db, storage, notifier }: Deps) {
  async function applyOne(sessionId: string, mutation: Mutation): Promise<{ result: MutationResult; cursor: number | null; removeKeys: string[] }> {
    const { id, type } = mutation;
    const unchanged = { cursor: null, removeKeys: [] };
    try {
      return await db.transaction(async (tx) => {
        if (await mutationsDb.findById(tx, id)) return { result: { id, status: 'duplicate' }, ...unchanged };
        try {
          // A savepoint: a rejection undoes this mutation's writes but keeps the transaction.
          const applied = await tx.transaction((savepoint) => applyMutation(savepoint, mutation));
          await mutationsDb.record(tx, { id, sessionId, type, status: 'applied' });
          return { result: { id, status: 'applied' }, cursor: await recordChanges(tx, applied.changes), removeKeys: applied.removeKeys };
        } catch (error) {
          if (!(error instanceof MutationRejected)) throw error;
          await mutationsDb.record(tx, { id, sessionId, type, status: 'rejected', reason: error.message });
          return { result: { id, status: 'rejected', reason: error.message }, ...unchanged };
        }
      });
    } catch (error) {
      // The same batch sent twice at once: the other request recorded this mutation first.
      if (isUniqueViolation(error) && (await mutationsDb.findById(db, id))) return { result: { id, status: 'duplicate' }, ...unchanged };
      throw error;
    }
  }

  return {
    // Mutations are applied in order, each in its own transaction, so one bad
    // mutation does not block the ones after it.
    async push(sessionId: string, mutations: readonly Mutation[]): Promise<PushResponse> {
      const results: MutationResult[] = [];
      let cursor: number | null = null;
      for (const mutation of mutations) {
        const outcome = await applyOne(sessionId, mutation);
        results.push(outcome.result);
        if (outcome.cursor !== null) cursor = Math.max(cursor ?? 0, outcome.cursor);
        await storage.remove(outcome.removeKeys);
      }
      notifier.libraryChanged(cursor);
      return { results };
    },

    // Read in one snapshot, so the rows match the change log page exactly.
    pull({ cursor, limit }: PullQuery): Promise<PullResponse> {
      return db.transaction(
        async (tx) => {
          const rows = await changesDb.listAfter(tx, cursor, limit + 1);
          const page = rows.slice(0, limit);

          // A row changed ten times in this page is sent once, in its current state.
          const latest = new Map(page.map((change) => [`${change.entity}:${change.entityId}`, change]));
          const ordered = [...latest.values()].sort((a, b) => a.seq - b.seq);
          const upserted = (entity: changesDb.ChangeRow['entity']) => ordered.filter((c) => c.entity === entity && c.op === 'upsert').map((c) => c.entityId);

          const songs = new Map((await songsDb.findByIds(tx, upserted('song'))).map((row) => [row.id, row]));
          const playlists = new Map((await playlistsDb.findByIds(tx, upserted('playlist'))).map((row) => [row.id, row]));
          const entries = new Map((await entriesDb.findByIds(tx, upserted('entry'))).map((row) => [row.id, row]));

          // An upsert whose row is gone was deleted later. The delete is sent now;
          // the later delete change repeats it, which is harmless.
          const changes = ordered.map(({ seq, entity, entityId, op }): Change => {
            if (entity === 'song') {
              const row = op === 'upsert' ? songs.get(entityId) : undefined;
              return row ? { seq, type: 'song.upserted', data: toSong(row) } : { seq, type: 'song.deleted', id: entityId };
            }
            if (entity === 'playlist') {
              const row = op === 'upsert' ? playlists.get(entityId) : undefined;
              return row ? { seq, type: 'playlist.upserted', data: toPlaylist(row) } : { seq, type: 'playlist.deleted', id: entityId };
            }
            const row = op === 'upsert' ? entries.get(entityId) : undefined;
            return row ? { seq, type: 'entry.upserted', data: toEntry(row) } : { seq, type: 'entry.deleted', id: entityId };
          });

          return { changes, cursor: page.at(-1)?.seq ?? cursor, hasMore: rows.length > limit };
        },
        { isolationLevel: 'repeatable read', accessMode: 'read only' },
      );
    },
  };
}

export type SyncService = ReturnType<typeof createSyncService>;

const upsert = (entity: ChangeInput['entity'], entityId: string): ChangeInput => ({ entity, entityId, op: 'upsert' });
const remove = (entity: ChangeInput['entity'], entityId: string): ChangeInput => ({ entity, entityId, op: 'delete' });
const only = (changes: ChangeInput[]): Applied => ({ changes, removeKeys: [] });

function definedOnly<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as Partial<T>;
}

async function applyMutation(tx: Transaction, mutation: Mutation): Promise<Applied> {
  switch (mutation.type) {
    case 'playlist.create': {
      const { playlistId, name, description } = mutation.payload;
      // Already exists when a download created it first; creating it again is a no-op.
      const created = await playlistsDb.insert(tx, { id: playlistId, name, description: description ?? null });
      return only(created ? [upsert('playlist', playlistId)] : []);
    }

    case 'playlist.update': {
      const { playlistId, ...fields } = mutation.payload;
      const patch = definedOnly(fields);
      const playlist = Object.keys(patch).length > 0 ? await playlistsDb.update(tx, playlistId, patch) : await playlistsDb.findById(tx, playlistId);
      if (!playlist) throw new MutationRejected('Playlist not found');
      return only([upsert('playlist', playlistId)]);
    }

    case 'playlist.delete': {
      const { playlistId } = mutation.payload;
      // Entry deletes are sent explicitly so phones never rely on cascading deletes.
      const entryIds = await entriesDb.removeByPlaylist(tx, playlistId);
      const removed = await playlistsDb.remove(tx, playlistId);
      return only(removed ? [...entryIds.map((id) => remove('entry', id)), remove('playlist', playlistId)] : []);
    }

    case 'playlist.addSongs': {
      const { playlistId, entries } = mutation.payload;
      if (!(await playlistsDb.findById(tx, playlistId))) throw new MutationRejected('Playlist not found');
      const songIds = new Set((await songsDb.findByIds(tx, [...new Set(entries.map((e) => e.songId))])).map((s) => s.id));
      const inserted = await entriesDb.insertMany(
        tx,
        entries.filter((e) => songIds.has(e.songId)).map((e) => ({ id: e.entryId, playlistId, songId: e.songId, position: e.position })),
      );
      // Entries not kept (song deleted, or already in the playlist) are deleted on the
      // phone too, so both sides end up with the same entries.
      const insertedIds = new Set(inserted.map((e) => e.id));
      return only([
        ...inserted.map((e) => upsert('entry', e.id)),
        ...entries.filter((e) => !insertedIds.has(e.entryId)).map((e) => remove('entry', e.entryId)),
      ]);
    }

    case 'playlist.moveEntry': {
      const moved = await entriesDb.updatePosition(tx, mutation.payload.entryId, mutation.payload.position);
      return only(moved ? [upsert('entry', moved.id)] : []);
    }

    case 'playlist.removeEntry': {
      const removed = await entriesDb.remove(tx, mutation.payload.entryId);
      return only(removed ? [remove('entry', mutation.payload.entryId)] : []);
    }

    case 'song.update': {
      const { songId } = mutation.payload;
      const song = await songsDb.findById(tx, songId);
      if (!song) throw new MutationRejected('Song not found');
      const patch = definedOnly(mutation.payload.patch);
      if (Object.keys(patch).length === 0) return only([]);

      // A new title or artist moves the file, e.g. Songs/Old/Title.opus -> Songs/New/Title.opus.
      const next = { ...song, ...patch };
      const path =
        patch.title !== undefined || patch.artist !== undefined
          ? await chooseSongPath(tx, { id: song.id, title: next.title, artist: next.artist, albumArtist: next.albumArtist, codec: song.audioCodec })
          : song.path;
      await songsDb.update(tx, songId, { ...patch, path });
      return only([upsert('song', songId)]);
    }

    case 'song.delete': {
      const { songId } = mutation.payload;
      const entryIds = await entriesDb.removeBySong(tx, songId);
      const removed = await songsDb.remove(tx, songId);
      if (!removed) return only([]);
      return {
        changes: [...entryIds.map((id) => remove('entry', id)), remove('song', songId)],
        removeKeys: [removed.audioKey, ...(removed.coverKey ? [removed.coverKey] : [])],
      };
    }

    case 'song.played': {
      const played = await songsDb.recordPlay(tx, mutation.payload.songId, new Date(mutation.payload.playedAt));
      return only(played ? [upsert('song', played.id)] : []);
    }
  }
}
