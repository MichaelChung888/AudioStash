import type { Playlist, PlaylistEntry, Song } from '@pluck/contracts';
import type { SQLiteDatabase } from 'expo-sqlite';

// Row writes shared by changes pulled from the server and edits made on this phone.

export async function upsertSong(tx: SQLiteDatabase, song: Song): Promise<void> {
  await tx.runAsync(
    `INSERT INTO songs (id, title, artist, created_at, data) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET title = excluded.title, artist = excluded.artist, created_at = excluded.created_at, data = excluded.data`,
    song.id,
    song.title,
    song.artist,
    song.createdAt,
    JSON.stringify(song),
  );
}

export async function deleteSong(tx: SQLiteDatabase, songId: string): Promise<void> {
  await tx.runAsync('DELETE FROM songs WHERE id = ?', songId);
  await tx.runAsync('DELETE FROM entries WHERE song_id = ?', songId);
}

export async function upsertPlaylist(tx: SQLiteDatabase, playlist: Playlist): Promise<void> {
  await tx.runAsync(
    `INSERT INTO playlists (id, name, created_at, data) VALUES (?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET name = excluded.name, created_at = excluded.created_at, data = excluded.data`,
    playlist.id,
    playlist.name,
    playlist.createdAt,
    JSON.stringify(playlist),
  );
}

export async function deletePlaylist(tx: SQLiteDatabase, playlistId: string): Promise<void> {
  await tx.runAsync('DELETE FROM playlists WHERE id = ?', playlistId);
  await tx.runAsync('DELETE FROM entries WHERE playlist_id = ?', playlistId);
}

export async function upsertEntry(tx: SQLiteDatabase, entry: PlaylistEntry): Promise<void> {
  await tx.runAsync(
    `INSERT INTO entries (id, playlist_id, song_id, position, added_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET playlist_id = excluded.playlist_id, song_id = excluded.song_id, position = excluded.position, added_at = excluded.added_at`,
    entry.id,
    entry.playlistId,
    entry.songId,
    entry.position,
    entry.addedAt,
  );
}

export async function deleteEntry(tx: SQLiteDatabase, entryId: string): Promise<void> {
  await tx.runAsync('DELETE FROM entries WHERE id = ?', entryId);
}

export async function readSong(tx: SQLiteDatabase, songId: string): Promise<Song | null> {
  const row = await tx.getFirstAsync<{ data: string }>('SELECT data FROM songs WHERE id = ?', songId);
  return row ? (JSON.parse(row.data) as Song) : null;
}

export async function readPlaylist(tx: SQLiteDatabase, playlistId: string): Promise<Playlist | null> {
  const row = await tx.getFirstAsync<{ data: string }>('SELECT data FROM playlists WHERE id = ?', playlistId);
  return row ? (JSON.parse(row.data) as Playlist) : null;
}
