import { isAbsolute, join } from 'node:path';
import type { ResolvedEntry } from '@pluck/contracts';
import { parseVideoTitle, youtubeVideoUrl } from '@pluck/core';
import { PermanentJobError } from '@pluck/messaging';
import { z } from 'zod';
import { ProcessError, run } from '../lib/process.ts';

const thumbnailSchema = z.object({ url: z.string(), width: z.number().nullish(), height: z.number().nullish() });

// The fields of yt-dlp's --dump-single-json output that the worker uses.
const videoInfoSchema = z.object({
  id: z.string(),
  title: z.string(),
  webpage_url: z.string(),
  extractor_key: z.string(),
  duration: z.number().nullish(),
  uploader: z.string().nullish(),
  channel: z.string().nullish(),
  // Set for YouTube Music uploads, SoundCloud and Bandcamp: cleaner than parsing the title.
  track: z.string().nullish(),
  artist: z.string().nullish(),
  artists: z.array(z.string()).nullish(),
  album: z.string().nullish(),
  release_year: z.number().nullish(),
  thumbnail: z.string().nullish(),
  thumbnails: z.array(thumbnailSchema).nullish(),
});
export type VideoInfo = z.infer<typeof videoInfoSchema>;

const flatEntrySchema = z.object({
  url: z.string().nullish(),
  id: z.string().nullish(),
  title: z.string().nullish(),
  duration: z.number().nullish(),
  channel: z.string().nullish(),
  uploader: z.string().nullish(),
  ie_key: z.string().nullish(),
});
type FlatEntry = z.infer<typeof flatEntrySchema>;

const collectionSchema = z.object({
  title: z.string().nullish(),
  webpage_url: z.string().nullish(),
  entries: z.array(flatEntrySchema.nullable()).nullish(),
});

export interface SearchResult {
  id: string;
  title: string;
  channel: string;
  durationSec: number | null;
}

export interface DownloadOptions {
  dir: string;
  removeNonMusic: boolean;
  onProgress?: (fraction: number | null) => void;
  signal?: AbortSignal;
}

const PROGRESS_PREFIX = 'pluck-progress ';
const FILE_PREFIX = 'pluck-file ';
const UNAVAILABLE_TITLES = new Set(['[Private video]', '[Deleted video]', '[Unavailable video]']);

// Errors that retrying cannot fix. "Sign in to confirm you're not a bot" is not
// here on purpose: YouTube lifts that block after a while.
const PERMANENT_ERRORS = [
  /video unavailable/i,
  /private video/i,
  /has been removed/i,
  /account associated with this video has been terminated/i,
  /not available in your country/i,
  /unsupported url/i,
  /members[- ]only|join this channel/i,
  /confirm your age/i,
  /http error 404/i,
];

export function createYtDlp(options: { path: string; ffmpegPath: string; cookiesFile?: string | undefined }) {
  const common = [
    // A yt-dlp config file on the PC must not change what the worker gets.
    '--ignore-config',
    '--no-color',
    '--no-warnings',
    // yt-dlp runs ffmpeg and ffprobe itself to cut SponsorBlock segments. A bare
    // name is found on PATH; a full path must be passed on.
    ...(isAbsolute(options.ffmpegPath) ? ['--ffmpeg-location', options.ffmpegPath] : []),
    ...(options.cookiesFile ? ['--cookies', options.cookiesFile] : []),
  ];

  async function ytdlp(args: string[], runOptions: Parameters<typeof run>[2]): Promise<string> {
    try {
      return (await run(options.path, [...common, ...args], runOptions)).stdout;
    } catch (error) {
      throw classifyError(error);
    }
  }

  return {
    async version(): Promise<string> {
      return (await run(options.path, ['--version'], { timeoutMs: 30_000 })).stdout.trim();
    },

    async probe(url: string, signal?: AbortSignal): Promise<VideoInfo> {
      const stdout = await ytdlp(['--dump-single-json', '--no-playlist', url], { signal, timeoutMs: 120_000 });
      return videoInfoSchema.parse(JSON.parse(stdout));
    },

    // Lists a playlist, album or profile without downloading anything.
    async listCollection(url: string, signal?: AbortSignal): Promise<{ title: string; entries: ResolvedEntry[] }> {
      const stdout = await ytdlp(['--dump-single-json', '--flat-playlist', url], { signal, timeoutMs: 10 * 60_000 });
      return parseCollection(JSON.parse(stdout));
    },

    async search(query: string, limit: number, signal?: AbortSignal): Promise<SearchResult[]> {
      const stdout = await ytdlp(['--dump-single-json', '--flat-playlist', `ytsearch${limit}:${query}`], { signal, timeoutMs: 120_000 });
      return parseSearch(JSON.parse(stdout));
    },

    // Downloads the best audio stream as is. Converting is left to ffmpeg, so the
    // worker decides when to re-encode and when to copy.
    async download(url: string, download: DownloadOptions): Promise<string> {
      let file: string | null = null;
      await ytdlp(
        [
          '--no-playlist',
          '--format',
          'bestaudio/best',
          '--output',
          join(download.dir, 'source.%(ext)s'),
          '--newline',
          '--progress',
          '--progress-template',
          `download:${PROGRESS_PREFIX}%(progress.downloaded_bytes)s %(progress.total_bytes)s %(progress.total_bytes_estimate)s`,
          '--print',
          `after_move:${FILE_PREFIX}%(filepath)s`,
          '--no-simulate',
          // SponsorBlock's community-marked non-music parts of music videos: intros, skits, outros.
          ...(download.removeNonMusic ? ['--sponsorblock-remove', 'music_offtopic'] : []),
          url,
        ],
        {
          signal: download.signal,
          timeoutMs: 30 * 60_000,
          onLine: (line) => {
            if (line.startsWith(FILE_PREFIX)) file = line.slice(FILE_PREFIX.length).trim();
            else if (line.startsWith(PROGRESS_PREFIX)) download.onProgress?.(parseProgress(line));
          },
        },
      );
      if (!file) throw new Error('yt-dlp finished without reporting the downloaded file');
      return file;
    },
  };
}

export type YtDlp = ReturnType<typeof createYtDlp>;

export function parseProgress(line: string): number | null {
  const [downloaded, total, estimate] = line.slice(PROGRESS_PREFIX.length).trim().split(/\s+/).map(Number);
  const size = Number.isFinite(total) && total ? total : estimate;
  if (!downloaded || !Number.isFinite(downloaded) || !size || !Number.isFinite(size)) return null;
  return Math.min(1, Math.max(0, downloaded / size));
}

export function parseCollection(json: unknown): { title: string; entries: ResolvedEntry[] } {
  const collection = collectionSchema.parse(json);
  // A link to a single video gives the video itself, with no entries.
  if (!collection.entries) {
    const video = videoInfoSchema.parse(json);
    return { title: video.title, entries: [toResolvedEntry({ ...video, url: video.webpage_url })].filter((e) => e !== null) };
  }
  return {
    title: collection.title ?? '',
    entries: collection.entries.flatMap((entry) => {
      const resolved = entry ? toResolvedEntry(entry) : null;
      return resolved ? [resolved] : [];
    }),
  };
}

export function parseSearch(json: unknown): SearchResult[] {
  const entries = collectionSchema.parse(json).entries ?? [];
  return entries.flatMap((entry) =>
    entry?.id && entry.title ? [{ id: entry.id, title: entry.title, channel: entry.channel ?? entry.uploader ?? '', durationSec: entry.duration ?? null }] : [],
  );
}

function toResolvedEntry(entry: FlatEntry): ResolvedEntry | null {
  if (entry.title && UNAVAILABLE_TITLES.has(entry.title)) return null;
  // A channel link lists its tabs (Videos, Shorts) as entries, which are not songs.
  if (entry.ie_key === 'YoutubeTab') return null;

  const url = entry.ie_key === 'Youtube' && entry.id ? youtubeVideoUrl(entry.id) : entry.url;
  if (!url || !URL.canParse(url)) return null;

  const parsed = entry.title ? parseVideoTitle(entry.title, entry.channel ?? entry.uploader) : null;
  return {
    url,
    title: parsed?.title ?? '',
    artist: parsed?.artist ?? null,
    durationSec: entry.duration ? Math.round(entry.duration) : null,
  };
}

export function classifyError(error: unknown): unknown {
  if (!(error instanceof ProcessError)) return error;
  const message = lastErrorLine(error.stderr) ?? error.message;
  return PERMANENT_ERRORS.some((pattern) => pattern.test(error.stderr)) ? new PermanentJobError(message) : new Error(message);
}

function lastErrorLine(stderr: string): string | undefined {
  return stderr
    .split(/\r?\n/)
    .filter((line) => line.startsWith('ERROR:'))
    .at(-1)
    ?.replace(/^ERROR:\s*/, '');
}
