import type { SongSource } from '@pluck/contracts';

export interface ParsedSourceUrl {
  source: SongSource;
  // track: one song. collection: a playlist, album or profile that must be
  // expanded into tracks first. unknown: let the downloader decide.
  kind: 'track' | 'collection' | 'unknown';
  // The provider's stable id when it can be read from the URL (YouTube video id).
  sourceId: string | null;
  url: string;
}

const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com']);
const SOUNDCLOUD_HOSTS = new Set(['soundcloud.com', 'www.soundcloud.com', 'm.soundcloud.com']);
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

export function youtubeVideoUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

export function parseSourceUrl(input: string): ParsedSourceUrl | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;

  const host = url.hostname.toLowerCase();

  if (host === 'youtu.be') {
    const id = url.pathname.split('/')[1] ?? '';
    return VIDEO_ID.test(id) ? youtubeVideo(id) : null;
  }

  if (YOUTUBE_HOSTS.has(host)) return parseYoutube(url);

  if (SOUNDCLOUD_HOSTS.has(host)) {
    const parts = pathParts(url);
    if (parts.length === 2 && !['sets', 'likes', 'tracks', 'albums', 'reposts'].includes(parts[1] ?? '')) {
      return { source: 'soundcloud', kind: 'track', sourceId: null, url: url.href };
    }
    return { source: 'soundcloud', kind: parts.length === 0 ? 'unknown' : 'collection', sourceId: null, url: url.href };
  }
  if (host === 'on.soundcloud.com') return { source: 'soundcloud', kind: 'unknown', sourceId: null, url: url.href };

  if (host.endsWith('.bandcamp.com')) {
    const [section] = pathParts(url);
    return { source: 'bandcamp', kind: section === 'track' ? 'track' : 'collection', sourceId: null, url: url.href };
  }

  return { source: 'other', kind: 'unknown', sourceId: null, url: url.href };
}

function parseYoutube(url: URL): ParsedSourceUrl | null {
  const list = url.searchParams.get('list');
  if (url.pathname === '/playlist' && list) {
    return { source: 'youtube', kind: 'collection', sourceId: null, url: `https://www.youtube.com/playlist?list=${encodeURIComponent(list)}` };
  }

  // A watch link that also has a `list` parameter is a song opened from a playlist
  // or an auto-generated mix. The user shared the song, so download only the song.
  if (url.pathname === '/watch') {
    const id = url.searchParams.get('v');
    return id && VIDEO_ID.test(id) ? youtubeVideo(id) : null;
  }

  const embedded = url.pathname.match(/^\/(?:shorts|live|embed|v)\/([A-Za-z0-9_-]{11})/);
  if (embedded?.[1]) return youtubeVideo(embedded[1]);

  // YouTube Music album pages (/browse/MPREb_...) and channel pages.
  if (url.pathname.startsWith('/browse/') || url.pathname.startsWith('/channel/') || url.pathname.startsWith('/@')) {
    return { source: 'youtube', kind: 'collection', sourceId: null, url: url.href };
  }
  return null;
}

function youtubeVideo(videoId: string): ParsedSourceUrl {
  return { source: 'youtube', kind: 'track', sourceId: videoId, url: youtubeVideoUrl(videoId) };
}

function pathParts(url: URL): string[] {
  return url.pathname.split('/').filter(Boolean);
}
