import type { FileTags } from '../tools/tagger.ts';
import type { FoundSource } from './find-source.ts';
import type { TrackMetadata } from './metadata.ts';

// Deezer's details win when the song was matched, because they are cleaner than
// what a video title gives. Otherwise the source's own details are kept.
// Lengths follow the API's limits.
export function songDetails(found: Pick<FoundSource, 'track' | 'isrc'>, metadata: TrackMetadata | null): FileTags {
  const { track } = found;
  return {
    title: clip(metadata?.title ?? track.title, 300) ?? 'Unknown title',
    artist: clip(metadata?.artist ?? track.artist, 300) ?? 'Unknown artist',
    album: clip(metadata?.album ?? track.album, 300),
    albumArtist: clip(metadata?.albumArtist ?? null, 300),
    year: metadata?.year ?? track.year,
    genre: clip(metadata?.genre ?? null, 100),
    trackNumber: metadata?.trackNumber ?? null,
    discNumber: metadata?.discNumber ?? null,
    isrc: metadata?.isrc ?? found.isrc,
  };
}

function clip(value: string | null, max: number): string | null {
  return value?.trim().slice(0, max) || null;
}
