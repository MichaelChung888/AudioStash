import {
  AUDIO_CODECS,
  DOWNLOAD_STATUSES,
  type DownloadOptions,
  ITEM_STAGES,
  ITEM_STATUSES,
  type ItemInput,
  type JobName,
  SONG_SOURCES,
} from '@audiostash/contracts';
import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  bigint,
  bigserial,
  boolean,
  check,
  customType,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

// Column names are converted to snake_case by the `casing` option in client.ts and drizzle.config.ts.

const timestamptz = () => timestamp({ withTimezone: true });

const timestamps = {
  createdAt: timestamptz().notNull().defaultNow(),
  updatedAt: timestamptz()
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

// Postgres sorts text using the database locale by default, which puts "a" before "B".
// Fractional index keys need plain byte order, which is what the "C" collation gives.
const byteOrderText = customType<{ data: string }>({ dataType: () => 'text collate "C"' });

const oneOf = (column: AnyPgColumn, values: readonly string[]) => sql`${column} in (${sql.raw(values.map((v) => `'${v}'`).join(', '))})`;

export const songs = pgTable(
  'songs',
  {
    // Reserved by the API when the worker starts uploading, so storage keys can use it.
    id: uuid().primaryKey(),
    title: text().notNull(),
    artist: text().notNull(),
    album: text(),
    albumArtist: text(),
    year: integer(),
    genre: text(),
    trackNumber: integer(),
    discNumber: integer(),
    isrc: text(),
    durationMs: integer().notNull(),
    source: text({ enum: SONG_SOURCES }).notNull(),
    // YouTube video id, SoundCloud or Bandcamp track id, "<site>:<id>" for other
    // sites, or the SHA-256 of an uploaded file.
    sourceId: text().notNull(),
    sourceUrl: text(),
    audioKey: text().notNull(),
    audioCodec: text({ enum: AUDIO_CODECS }).notNull(),
    audioBitrateKbps: integer(),
    audioSizeBytes: bigint({ mode: 'number' }).notNull(),
    audioSha256: text().notNull(),
    coverKey: text(),
    coverColor: text(),
    lyricsPlain: text(),
    lyricsSynced: text(),
    loudnessLufs: real(),
    gainDb: real(),
    path: text().notNull(),
    playCount: integer().notNull().default(0),
    lastPlayedAt: timestamptz(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('songs_source_unique').on(t.source, t.sourceId),
    // Case-insensitive, because SD cards (FAT/exFAT) treat "ABBA" and "Abba" as the same folder.
    uniqueIndex('songs_path_unique').on(sql`lower(${t.path})`),
    index('songs_isrc_idx').on(t.isrc),
    check('songs_source_check', oneOf(t.source, SONG_SOURCES)),
    check('songs_audio_codec_check', oneOf(t.audioCodec, AUDIO_CODECS)),
  ],
);

export const playlists = pgTable('playlists', {
  // Generated on the phone, so a playlist made offline keeps its id after sync.
  id: uuid().primaryKey(),
  name: text().notNull(),
  description: text(),
  sourceUrl: text(),
  ...timestamps,
});

export const playlistEntries = pgTable(
  'playlist_entries',
  {
    id: uuid().primaryKey(),
    playlistId: uuid()
      .notNull()
      .references(() => playlists.id, { onDelete: 'cascade' }),
    songId: uuid()
      .notNull()
      .references(() => songs.id, { onDelete: 'cascade' }),
    position: byteOrderText().notNull(),
    addedAt: timestamptz().notNull().defaultNow(),
  },
  (t) => [uniqueIndex('playlist_entries_song_unique').on(t.playlistId, t.songId), index('playlist_entries_order_idx').on(t.playlistId, t.position)],
);

export const CHANGE_ENTITIES = ['song', 'playlist', 'entry'] as const;
export type ChangeEntity = (typeof CHANGE_ENTITIES)[number];
export const CHANGE_OPS = ['upsert', 'delete'] as const;
export type ChangeOp = (typeof CHANGE_OPS)[number];

// Append-only log of library writes. Phones pull rows after their last seen `seq`.
export const libraryChanges = pgTable(
  'library_changes',
  {
    seq: bigserial({ mode: 'number' }).primaryKey(),
    entity: text({ enum: CHANGE_ENTITIES }).notNull(),
    entityId: uuid().notNull(),
    op: text({ enum: CHANGE_OPS }).notNull(),
    createdAt: timestamptz().notNull().defaultNow(),
  },
  (t) => [check('library_changes_entity_check', oneOf(t.entity, CHANGE_ENTITIES)), check('library_changes_op_check', oneOf(t.op, CHANGE_OPS))],
);

// Ids of mutations already applied, so a phone resending a batch has no effect.
export const appliedMutations = pgTable('applied_mutations', {
  id: uuid().primaryKey(),
  // The Clerk session that sent it, for debugging.
  sessionId: text().notNull(),
  type: text().notNull(),
  status: text({ enum: ['applied', 'rejected'] }).notNull(),
  reason: text(),
  appliedAt: timestamptz().notNull().defaultNow(),
});

export const downloads = pgTable(
  'downloads',
  {
    // Generated on the phone, so retrying the request cannot create a duplicate.
    id: uuid().primaryKey(),
    title: text().notNull(),
    sourceKind: text({ enum: ['url', 'catalog', 'upload'] }).notNull(),
    sourceUrl: text(),
    options: jsonb().$type<DownloadOptions>().notNull(),
    playlistId: uuid().references(() => playlists.id, { onDelete: 'set null' }),
    // True when the target playlist was created for this download without a name,
    // so it takes the source playlist's title once resolved.
    namePlaylistFromSource: boolean().notNull().default(false),
    status: text({ enum: DOWNLOAD_STATUSES }).notNull(),
    error: text(),
    ...timestamps,
    finishedAt: timestamptz(),
  },
  (t) => [index('downloads_created_idx').on(t.createdAt), check('downloads_status_check', oneOf(t.status, DOWNLOAD_STATUSES))],
);

export const downloadItems = pgTable(
  'download_items',
  {
    id: uuid().primaryKey().defaultRandom(),
    downloadId: uuid()
      .notNull()
      .references(() => downloads.id, { onDelete: 'cascade' }),
    position: integer().notNull(),
    input: jsonb().$type<ItemInput>().notNull(),
    title: text().notNull(),
    artist: text(),
    status: text({ enum: ITEM_STATUSES }).notNull().default('queued'),
    stage: text({ enum: ITEM_STAGES }),
    attempts: integer().notNull().default(0),
    workerId: text(),
    claimedAt: timestamptz(),
    // Reserved when the worker reports its source, so storage keys can use it before the song row exists.
    pendingSongId: uuid(),
    songId: uuid().references(() => songs.id, { onDelete: 'set null' }),
    // Where the song goes in the target playlist. Assigned up front so an imported
    // playlist keeps the source order, whatever order the items finish in.
    playlistPosition: byteOrderText(),
    error: text(),
    ...timestamps,
    finishedAt: timestamptz(),
  },
  (t) => [
    uniqueIndex('download_items_position_unique').on(t.downloadId, t.position),
    index('download_items_status_idx').on(t.status),
    check('download_items_status_check', oneOf(t.status, ITEM_STATUSES)),
  ],
);

// Transactional outbox. A job row is written in the same transaction as the state
// it belongs to; a relay publishes it to RabbitMQ afterwards and sets published_at.
export const outbox = pgTable(
  'outbox',
  {
    id: bigserial({ mode: 'number' }).primaryKey(),
    job: text().$type<JobName>().notNull(),
    payload: jsonb().notNull(),
    messageId: uuid().notNull().defaultRandom(),
    createdAt: timestamptz().notNull().defaultNow(),
    publishedAt: timestamptz(),
    attempts: integer().notNull().default(0),
    lastError: text(),
  },
  (t) => [index('outbox_unpublished_idx').on(t.id).where(sql`${t.publishedAt} is null`)],
);
