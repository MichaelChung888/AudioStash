import type { Download, DownloadItem, Playlist, PlaylistEntry, Song } from '@audiostash/contracts';
import type { DownloadRow } from './downloads.ts';
import type { EntryRow } from './entries.ts';
import type { ItemCounts, ItemRow } from './items.ts';
import type { PlaylistRow } from './playlists.ts';
import type { SongRow } from './songs.ts';

// Database rows -> API shapes from @audiostash/contracts. Storage keys, token hashes and
// worker bookkeeping stay on the server.

const iso = (date: Date) => date.toISOString();
const isoOrNull = (date: Date | null) => (date ? date.toISOString() : null);

export function toSong(row: SongRow): Song {
  return {
    id: row.id,
    title: row.title,
    artist: row.artist,
    album: row.album,
    albumArtist: row.albumArtist,
    year: row.year,
    genre: row.genre,
    trackNumber: row.trackNumber,
    discNumber: row.discNumber,
    isrc: row.isrc,
    durationMs: row.durationMs,
    source: row.source,
    sourceUrl: row.sourceUrl,
    audio: { codec: row.audioCodec, bitrateKbps: row.audioBitrateKbps, sizeBytes: row.audioSizeBytes, sha256: row.audioSha256 },
    coverColor: row.coverColor,
    hasCover: row.coverKey !== null,
    lyrics: row.lyricsPlain || row.lyricsSynced ? { plain: row.lyricsPlain, synced: row.lyricsSynced } : null,
    loudness: row.loudnessLufs !== null && row.gainDb !== null ? { lufs: row.loudnessLufs, gainDb: row.gainDb } : null,
    path: row.path,
    playCount: row.playCount,
    lastPlayedAt: isoOrNull(row.lastPlayedAt),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

export function toPlaylist(row: PlaylistRow): Playlist {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    sourceUrl: row.sourceUrl,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

export function toEntry(row: EntryRow): PlaylistEntry {
  return { id: row.id, playlistId: row.playlistId, songId: row.songId, position: row.position, addedAt: iso(row.addedAt) };
}

export function toDownload(row: DownloadRow, counts: ItemCounts): Download {
  return {
    id: row.id,
    title: row.title,
    sourceKind: row.sourceKind,
    sourceUrl: row.sourceUrl,
    status: row.status,
    options: row.options,
    playlistId: row.playlistId,
    counts: { total: counts.total, completed: counts.completed, skipped: counts.skipped, failed: counts.failed, cancelled: counts.cancelled },
    error: row.error,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
    finishedAt: isoOrNull(row.finishedAt),
  };
}

export function toItem(row: ItemRow): DownloadItem {
  return {
    id: row.id,
    downloadId: row.downloadId,
    position: row.position,
    title: row.title,
    artist: row.artist,
    status: row.status,
    stage: row.stage,
    // Live progress is sent as events by the worker and never stored.
    progress: null,
    songId: row.songId,
    attempts: row.attempts,
    error: row.error,
    updatedAt: iso(row.updatedAt),
  };
}
