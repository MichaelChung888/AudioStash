import type { DeezerAlbum, DeezerClient, DeezerTrack, DeezerTrackDetail } from '@pluck/catalog';
import { type MatchCandidate, pickBestMatch, stripFeaturing } from '@pluck/core';
import type { Logger } from '../lib/logger.ts';

export interface TrackMetadata {
  title: string;
  artist: string;
  album: string | null;
  albumArtist: string | null;
  year: number | null;
  genre: string | null;
  trackNumber: number | null;
  discNumber: number | null;
  isrc: string | null;
  durationSec: number | null;
  coverUrl: string | null;
}

export interface MetadataQuery {
  title: string;
  artist: string | null;
  durationSec: number | null;
  isrc?: string | null | undefined;
  deezerId?: number | null | undefined;
}

// Higher than the YouTube match threshold. A wrong match is worse than none: it
// would rename the song and give it another song's cover.
const MATCH_THRESHOLD = 0.7;
const SEARCH_LIMIT = 10;

// Looks a song up on Deezer for clean titles, album details, genre, ISRC and a
// square cover. Exact ids are tried before a search.
export function createMetadataLookup({ deezer, logger }: { deezer: DeezerClient; logger: Logger }) {
  async function findTrack(query: MetadataQuery): Promise<DeezerTrackDetail | null> {
    if (query.deezerId) {
      const track = await deezer.track(query.deezerId);
      if (track) return track;
    }
    if (query.isrc) {
      const track = await deezer.trackByIsrc(query.isrc);
      if (track) return track;
    }
    // A title alone matches too many songs.
    if (!query.artist) return null;

    const results = await deezer.searchTracks(`${stripFeaturing(query.artist)} ${query.title}`, SEARCH_LIMIT);
    const target = { title: query.title, artist: query.artist, durationSec: query.durationSec ?? undefined };
    const best = pickBestMatch(target, results.map(toCandidate), MATCH_THRESHOLD);
    return best ? deezer.track(Number(best.id)) : null;
  }

  return {
    // Never throws. Metadata improves a song but is not needed, so on any failure
    // the song keeps the details its source gave.
    async lookup(query: MetadataQuery): Promise<TrackMetadata | null> {
      try {
        const track = await findTrack(query);
        if (!track) return null;
        const album = await deezer.album(track.album.id);
        return toMetadata(track, album);
      } catch (error) {
        logger.warn({ err: error, title: query.title, artist: query.artist }, 'metadata lookup failed');
        return null;
      }
    },
  };
}

export type MetadataLookup = ReturnType<typeof createMetadataLookup>;

function toCandidate(track: DeezerTrack): MatchCandidate {
  return { id: String(track.id), title: track.title, channel: track.artist.name, durationSec: track.duration };
}

function toMetadata(track: DeezerTrackDetail, album: DeezerAlbum | null): TrackMetadata {
  return {
    title: track.title,
    artist: track.artist.name,
    album: track.album.title,
    albumArtist: album?.artist.name ?? null,
    year: parseYear(album?.release_date) ?? parseYear(track.release_date),
    genre: album?.genres?.data[0]?.name ?? null,
    trackNumber: track.track_position ?? null,
    discNumber: track.disk_number ?? null,
    isrc: track.isrc ?? null,
    durationSec: track.duration || null,
    coverUrl: track.album.cover_xl ?? null,
  };
}

// Deezer uses "0000-00-00" for an unknown date.
function parseYear(date: string | null | undefined): number | null {
  const year = Number(date?.slice(0, 4));
  return Number.isInteger(year) && year > 0 ? year : null;
}
