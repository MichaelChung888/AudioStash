import type { Playlist, PlaylistEntry, Song } from '@audiostash/contracts';
import { db } from './database.ts';
import { readPlaylist } from './rows.ts';

// A song plus where it is on this phone. Both are null until the song is saved.
export interface LibrarySong extends Song {
  fileUri: string | null;
  coverUri: string | null;
}

export interface PlaylistItem {
  entry: PlaylistEntry;
  song: LibrarySong;
}

export interface PlaylistSummary {
  playlist: Playlist;
  songCount: number;
  durationMs: number;
  sizeOnPhone: number;
  // The first four songs' covers, for the playlist's cover grid.
  tiles: { uri: string | null; color: string | null }[];
}

export interface LibraryTotals {
  songCount: number;
  durationMs: number;
  savedCount: number;
  sizeOnPhone: number;
}

interface SongRow {
  data: string;
  file_uri: string | null;
  cover_uri: string | null;
}

const SONG_SELECT = 'SELECT s.data AS data, f.uri AS file_uri, f.cover_uri AS cover_uri FROM songs s LEFT JOIN saved_songs f ON f.song_id = s.id';

function toLibrarySong(row: SongRow): LibrarySong {
  return { ...(JSON.parse(row.data) as Song), fileUri: row.file_uri, coverUri: row.cover_uri };
}

export async function listSongs(): Promise<LibrarySong[]> {
  const rows = await db().getAllAsync<SongRow>(`${SONG_SELECT} ORDER BY s.created_at DESC`);
  return rows.map(toLibrarySong);
}

export async function listSongIds(): Promise<Set<string>> {
  const rows = await db().getAllAsync<{ id: string }>('SELECT id FROM songs');
  return new Set(rows.map((row) => row.id));
}

export async function getSong(songId: string): Promise<LibrarySong | null> {
  const row = await db().getFirstAsync<SongRow>(`${SONG_SELECT} WHERE s.id = ?`, songId);
  return row ? toLibrarySong(row) : null;
}

export async function getPlaylist(playlistId: string): Promise<Playlist | null> {
  return readPlaylist(db(), playlistId);
}

export async function getPlaylistItems(playlistId: string): Promise<PlaylistItem[]> {
  const rows = await db().getAllAsync<SongRow & { id: string; song_id: string; position: string; added_at: string }>(
    `SELECT e.id, e.song_id, e.position, e.added_at, s.data AS data, f.uri AS file_uri, f.cover_uri AS cover_uri
     FROM entries e
     JOIN songs s ON s.id = e.song_id
     LEFT JOIN saved_songs f ON f.song_id = e.song_id
     WHERE e.playlist_id = ?
     ORDER BY e.position`,
    playlistId,
  );
  return rows.map((row) => ({
    entry: { id: row.id, playlistId, songId: row.song_id, position: row.position, addedAt: row.added_at },
    song: toLibrarySong(row),
  }));
}

export async function listPlaylists(): Promise<PlaylistSummary[]> {
  const database = db();
  const [playlists, totals, tiles] = await Promise.all([
    database.getAllAsync<{ data: string }>('SELECT data FROM playlists ORDER BY name COLLATE NOCASE'),
    database.getAllAsync<{ playlist_id: string; songs: number; duration_ms: number; size: number }>(
      `SELECT e.playlist_id, COUNT(*) AS songs, SUM(json_extract(s.data, '$.durationMs')) AS duration_ms, SUM(COALESCE(f.size_bytes, 0)) AS size
       FROM entries e
       JOIN songs s ON s.id = e.song_id
       LEFT JOIN saved_songs f ON f.song_id = e.song_id
       GROUP BY e.playlist_id`,
    ),
    database.getAllAsync<{ playlist_id: string; cover_uri: string | null; cover_color: string | null }>(
      `SELECT playlist_id, cover_uri, cover_color FROM (
         SELECT e.playlist_id, f.cover_uri, json_extract(s.data, '$.coverColor') AS cover_color,
                ROW_NUMBER() OVER (PARTITION BY e.playlist_id ORDER BY e.position) AS n
         FROM entries e
         JOIN songs s ON s.id = e.song_id
         LEFT JOIN saved_songs f ON f.song_id = e.song_id
       ) WHERE n <= 4`,
    ),
  ]);

  const totalsById = new Map(totals.map((row) => [row.playlist_id, row]));
  const tilesById = new Map<string, PlaylistSummary['tiles']>();
  for (const row of tiles) {
    const list = tilesById.get(row.playlist_id) ?? [];
    list.push({ uri: row.cover_uri, color: row.cover_color });
    tilesById.set(row.playlist_id, list);
  }

  return playlists.map((row) => {
    const playlist = JSON.parse(row.data) as Playlist;
    const total = totalsById.get(playlist.id);
    return {
      playlist,
      songCount: total?.songs ?? 0,
      durationMs: total?.duration_ms ?? 0,
      sizeOnPhone: total?.size ?? 0,
      tiles: tilesById.get(playlist.id) ?? [],
    };
  });
}

export async function getLibraryTotals(): Promise<LibraryTotals> {
  const row = await db().getFirstAsync<{ songs: number; duration_ms: number | null; saved: number; size: number | null }>(
    `SELECT COUNT(*) AS songs, SUM(json_extract(s.data, '$.durationMs')) AS duration_ms, COUNT(f.song_id) AS saved, SUM(f.size_bytes) AS size
     FROM songs s LEFT JOIN saved_songs f ON f.song_id = s.id`,
  );
  return { songCount: row?.songs ?? 0, durationMs: row?.duration_ms ?? 0, savedCount: row?.saved ?? 0, sizeOnPhone: row?.size ?? 0 };
}
