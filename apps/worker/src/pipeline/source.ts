import type { SongSource } from '@audiostash/contracts';
import { parseVideoTitle, youtubeVideoUrl } from '@audiostash/core';
import type { VideoInfo } from '../tools/ytdlp.ts';

// Identifies where a song came from. The API keeps one song per (source, sourceId),
// which is how it spots a song that is already in the library.
export interface SourceRef {
  source: SongSource;
  sourceId: string;
  sourceUrl: string | null;
}

export interface SourceTrack {
  title: string;
  artist: string | null;
  album: string | null;
  year: number | null;
}

// yt-dlp's extractor_key names the site code that handled the link.
export function sourceFromInfo(info: VideoInfo): SourceRef {
  switch (info.extractor_key) {
    case 'Youtube':
      return { source: 'youtube', sourceId: info.id, sourceUrl: youtubeVideoUrl(info.id) };
    case 'Soundcloud':
      return { source: 'soundcloud', sourceId: info.id, sourceUrl: info.webpage_url };
    case 'Bandcamp':
      return { source: 'bandcamp', sourceId: info.id, sourceUrl: info.webpage_url };
    default:
      // Ids are only unique within one site, so the site name is part of the id.
      return { source: 'other', sourceId: `${info.extractor_key.toLowerCase()}:${info.id}`, sourceUrl: info.webpage_url };
  }
}

// YouTube Music, SoundCloud and Bandcamp fill in track and artist. Plain YouTube
// videos only have a title such as "Artist - Song (Official Video)", which is parsed.
export function trackFromInfo(info: VideoInfo): SourceTrack {
  const artist = info.artist ?? (info.artists?.length ? info.artists.join(', ') : null);
  const details = { album: info.album ?? null, year: info.release_year ?? null };
  if (info.track && artist) return { title: info.track, artist, ...details };

  const parsed = parseVideoTitle(info.title, info.channel ?? info.uploader);
  return { title: parsed.title || info.title, artist: parsed.artist, ...details };
}

export function bestThumbnail(info: VideoInfo): string | null {
  const sized = (info.thumbnails ?? []).filter((t) => t.width && t.height);
  const largest = sized.reduce<(typeof sized)[number] | null>(
    (best, t) => (!best || (t.width ?? 0) * (t.height ?? 0) > (best.width ?? 0) * (best.height ?? 0) ? t : best),
    null,
  );
  return largest?.url ?? info.thumbnail ?? null;
}
