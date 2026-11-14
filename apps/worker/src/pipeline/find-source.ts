import { createWriteStream } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { ClaimedItem, TrackHint } from '@audiostash/contracts';
import { parseVideoTitle, pickBestMatch, youtubeVideoUrl } from '@audiostash/core';
import { PermanentJobError } from '@audiostash/messaging';
import { describeFile } from '../lib/files.ts';
import type { Ffmpeg } from '../tools/ffmpeg.ts';
import type { VideoInfo, YtDlp } from '../tools/ytdlp.ts';
import { bestThumbnail, type SourceRef, type SourceTrack, sourceFromInfo, trackFromInfo } from './source.ts';

// What the matching stage learns about a song before any audio is processed.
export interface FoundSource {
  ref: SourceRef;
  track: SourceTrack;
  isrc: string | null;
  durationSec: number | null;
  // yt-dlp downloads the audio from here. Null for uploads, whose file is already local.
  downloadUrl: string | null;
  file: string | null;
  // An uploaded file's own cover art.
  hasEmbeddedPicture: boolean;
  thumbnailUrl: string | null;
}

interface Deps {
  ytdlp: Pick<YtDlp, 'probe' | 'search'>;
  ffmpeg: Pick<Ffmpeg, 'probe'>;
  fetch: typeof fetch;
}

const SEARCH_RESULTS = 8;
const ISRC = /^[A-Z]{2}[A-Z0-9]{3}\d{7}$/;

export function createSourceFinder({ ytdlp, ffmpeg, fetch }: Deps) {
  async function fromUrl(url: string): Promise<FoundSource> {
    const info = await ytdlp.probe(url);
    return fromInfo(info, trackFromInfo(info), null);
  }

  // A song picked from the charts or a search has no audio yet, so YouTube is
  // searched and the closest match by title, artist and length is used.
  async function fromCatalog(hint: TrackHint): Promise<FoundSource> {
    const results = await ytdlp.search(`${hint.artist} - ${hint.title}`, SEARCH_RESULTS);
    const best = pickBestMatch({ title: hint.title, artist: hint.artist, durationSec: hint.durationSec }, results);
    if (!best) throw new PermanentJobError(`No match on YouTube for "${hint.artist} - ${hint.title}"`);

    const info = await ytdlp.probe(youtubeVideoUrl(best.id));
    // The chart's title and artist are cleaner than the video's.
    return fromInfo(info, { title: hint.title, artist: hint.artist, album: hint.album ?? null, year: null }, hint.isrc ?? null);
  }

  async function fromUpload(filename: string, inputUrl: string | null, dir: string): Promise<FoundSource> {
    if (!inputUrl) throw new Error('The API sent no download link for the uploaded file');
    const file = join(dir, `input${safeExtension(filename)}`);
    await fetchToFile(inputUrl, file);

    const [{ sha256 }, probe] = await Promise.all([describeFile(file), ffmpeg.probe(file)]);
    return {
      // The same file uploaded twice has the same hash, so it is stored once.
      ref: { source: 'upload', sourceId: sha256, sourceUrl: null },
      track: trackFromTags(probe.tags, filename),
      isrc: normalizeIsrc(probe.tags.isrc ?? probe.tags.tsrc),
      durationSec: probe.durationMs / 1000,
      downloadUrl: null,
      file,
      hasEmbeddedPicture: probe.hasPicture,
      thumbnailUrl: null,
    };
  }

  async function fetchToFile(url: string, path: string): Promise<void> {
    const response = await fetch(url, { signal: AbortSignal.timeout(10 * 60_000) });
    if (!response.ok || !response.body) throw new Error(`Could not fetch the uploaded file: HTTP ${response.status}`);
    await pipeline(response.body, createWriteStream(path));
  }

  return {
    find(item: ClaimedItem, dir: string): Promise<FoundSource> {
      switch (item.input.kind) {
        case 'url':
          return fromUrl(item.input.url);
        case 'catalog':
          return fromCatalog(item.input.hint);
        case 'upload':
          return fromUpload(item.input.filename, item.inputUrl, dir);
      }
    },
  };
}

export type SourceFinder = ReturnType<typeof createSourceFinder>;

function fromInfo(info: VideoInfo, track: SourceTrack, isrc: string | null): FoundSource {
  return {
    ref: sourceFromInfo(info),
    track,
    isrc,
    durationSec: info.duration ?? null,
    downloadUrl: info.webpage_url,
    file: null,
    hasEmbeddedPicture: false,
    thumbnailUrl: bestThumbnail(info),
  };
}

// Files without tags are often named "Artist - Title.mp3".
export function trackFromTags(tags: Record<string, string>, filename: string): SourceTrack {
  const name = basename(filename, extname(filename));
  const parsed = parseVideoTitle(name);
  const year = Number(tags.date?.slice(0, 4));
  return {
    title: tags.title?.trim() || parsed.title || name,
    artist: tags.artist?.trim() || tags.album_artist?.trim() || parsed.artist,
    album: tags.album?.trim() || null,
    year: Number.isInteger(year) && year > 0 ? year : null,
  };
}

export function normalizeIsrc(value: string | undefined): string | null {
  const isrc = value?.replace(/[-\s]/g, '').toUpperCase();
  return isrc && ISRC.test(isrc) ? isrc : null;
}

// The extension only helps ffprobe guess the format, so anything unusual is dropped.
function safeExtension(filename: string): string {
  const ext = extname(filename).toLowerCase();
  return /^\.[a-z0-9]{1,5}$/.test(ext) ? ext : '';
}
