import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';

// The phone's copy of the library, so it works with no connection. The server is
// the source of truth: these tables are rebuilt from its change log (see sync/).
// Song and playlist rows keep the server's JSON in `data`, plus the columns we sort by.
//
// Each entry runs once, in order. Never edit one that has shipped; add a new one.
const MIGRATIONS = [
  `
  CREATE TABLE songs (
    id TEXT PRIMARY KEY NOT NULL,
    title TEXT NOT NULL,
    artist TEXT NOT NULL,
    created_at TEXT NOT NULL,
    data TEXT NOT NULL
  );
  CREATE TABLE playlists (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL,
    data TEXT NOT NULL
  );
  -- No foreign keys: a page of changes can deliver an entry before its song.
  -- position is a fractional index key. SQLite's default BINARY collation
  -- compares bytes, which is the order the keys are made for.
  CREATE TABLE entries (
    id TEXT PRIMARY KEY NOT NULL,
    playlist_id TEXT NOT NULL,
    song_id TEXT NOT NULL,
    position TEXT NOT NULL,
    added_at TEXT NOT NULL
  );
  CREATE INDEX entries_by_playlist ON entries (playlist_id, position);
  CREATE INDEX entries_by_song ON entries (song_id);

  -- Edits made on this phone, waiting to be sent. seq keeps them in order.
  CREATE TABLE outbox (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    mutation TEXT NOT NULL
  );

  -- Songs saved in the music folder. uri is what the player opens.
  CREATE TABLE saved_songs (
    song_id TEXT PRIMARY KEY NOT NULL,
    path TEXT NOT NULL,
    uri TEXT NOT NULL,
    sha256 TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    cover_uri TEXT
  );
  -- Playlist files (.m3u8) written to the music folder, so they are rewritten only when they change.
  CREATE TABLE saved_playlists (
    playlist_id TEXT PRIMARY KEY NOT NULL,
    path TEXT NOT NULL,
    content TEXT NOT NULL
  );

  CREATE TABLE settings (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
  );
  `,
];

let database: SQLiteDatabase | null = null;

export async function openDatabase(): Promise<SQLiteDatabase> {
  if (database) return database;
  const db = await openDatabaseAsync('audiostash.db');
  // WAL lets the screens read while a sync is writing.
  await db.execAsync('PRAGMA journal_mode = WAL;');
  await migrate(db);
  database = db;
  return db;
}

// For code that runs after the root layout has opened the database.
export function db(): SQLiteDatabase {
  if (!database) throw new Error('The database is not open yet.');
  return database;
}

async function migrate(db: SQLiteDatabase) {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  for (let version = row?.user_version ?? 0; version < MIGRATIONS.length; version++) {
    const sql = MIGRATIONS[version] as string;
    await db.withExclusiveTransactionAsync(async (tx) => {
      await tx.execAsync(sql);
      await tx.execAsync(`PRAGMA user_version = ${version + 1}`);
    });
  }
}

// For signing out. The next sign-in pulls the library again. The saved_ tables
// and the music folder setting stay, so songs already on the phone are not downloaded twice.
export async function clearLibrary(): Promise<void> {
  await db().execAsync(`DELETE FROM songs; DELETE FROM playlists; DELETE FROM entries; DELETE FROM outbox; DELETE FROM settings WHERE key = 'cursor';`);
}

type Listener = () => void;
const listeners = new Set<Listener>();

// Called after every committed change, so screens reading the library reload.
export function notifyLibraryChanged(): void {
  for (const listener of listeners) listener();
}

export function onLibraryChanged(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
