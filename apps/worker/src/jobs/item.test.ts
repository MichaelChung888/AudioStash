import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ClaimedItem, DownloadOptions } from '@audiostash/contracts';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type ApiClient, ApiError } from '../api/client.ts';
import type { FoundSource } from '../pipeline/find-source.ts';
import type { TrackMetadata } from '../pipeline/metadata.ts';
import { silentLogger } from '../testing/logger.ts';
import type { AudioProbe } from '../tools/ffmpeg.ts';
import { createItemJob } from './item.ts';

const ITEM_ID = '00000000-0000-4000-8000-000000000001';
const DOWNLOAD_ID = '00000000-0000-4000-8000-000000000002';
const SONG_ID = '00000000-0000-4000-8000-000000000003';
const context = { messageId: 'm', attempt: 1, isLastAttempt: false };

const options: DownloadOptions = { format: 'best', metadata: true, cover: true, lyrics: true, removeNonMusic: true };

const claimed = (overrides: Partial<ClaimedItem> = {}): ClaimedItem => ({
  id: ITEM_ID,
  downloadId: DOWNLOAD_ID,
  input: { kind: 'url', url: 'https://youtu.be/aaaaaaaaaaa' },
  options,
  inputUrl: null,
  ...overrides,
});

const youtubeSource = (overrides: Partial<FoundSource> = {}): FoundSource => ({
  ref: { source: 'youtube', sourceId: 'aaaaaaaaaaa', sourceUrl: 'https://www.youtube.com/watch?v=aaaaaaaaaaa' },
  track: { title: 'Houdini', artist: 'Dua Lipa', album: null, year: null },
  isrc: null,
  durationSec: 190,
  downloadUrl: 'https://www.youtube.com/watch?v=aaaaaaaaaaa',
  file: null,
  hasEmbeddedPicture: false,
  thumbnailUrl: 'https://i.ytimg.com/vi/aaaaaaaaaaa/maxresdefault.jpg',
  ...overrides,
});

const metadata: TrackMetadata = {
  title: 'Houdini',
  artist: 'Dua Lipa',
  album: 'Radical Optimism',
  albumArtist: 'Dua Lipa',
  year: 2024,
  genre: 'Pop',
  trackNumber: 3,
  discNumber: 1,
  isrc: 'GBAHS2300001',
  durationSec: 185,
  coverUrl: 'https://cdn.deezer.test/cover.jpg',
};

const probe = (codec: string): AudioProbe => ({ codec, durationMs: 185_000, bitrateKbps: 131, hasPicture: false, tags: {} });

let workDir: string;
beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'audiostash-item-'));
});
afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

async function setup(overrides: { item?: ClaimedItem; found?: FoundSource; metadata?: TrackMetadata | null } = {}) {
  const coverImage = await sharp({ create: { width: 1000, height: 1000, channels: 3, background: { r: 20, g: 20, b: 200 } } })
    .png()
    .toBuffer();
  const calls: string[] = [];
  const track =
    <A extends unknown[], R>(name: string, impl: (...args: A) => R) =>
    (...args: A) => {
      calls.push(name);
      return impl(...args);
    };

  const api = {
    claimItem: vi.fn(track('claimItem', async () => ({ status: 'proceed' as const, item: overrides.item ?? claimed() }))),
    setStage: vi.fn(async (_id: string, stage: string) => {
      calls.push(`stage:${stage}`);
    }),
    reportSource: vi.fn(track('reportSource', async () => ({ status: 'proceed' as const, songId: SONG_ID }))),
    uploadUrls: vi.fn(
      track('uploadUrls', async (_id: string, body: { hasCover: boolean }) => ({
        audio: { key: `songs/${SONG_ID}/audio.opus`, url: 'https://bucket.test/audio', contentType: 'audio/ogg' },
        cover: body.hasCover ? { key: `songs/${SONG_ID}/cover.jpg`, url: 'https://bucket.test/cover', contentType: 'image/jpeg' } : null,
      })),
    ),
    completeItem: vi.fn(track('completeItem', async () => ({ songId: SONG_ID }))),
    failItem: vi.fn(async () => {}),
  };

  const deps = {
    api: api as unknown as ApiClient,
    sources: { find: vi.fn(track('find', async () => overrides.found ?? youtubeSource())) },
    ytdlp: {
      download: vi.fn(
        track('download', async (_url: string, opts: { dir: string; onProgress?: (fraction: number | null) => void }) => {
          opts.onProgress?.(0.5);
          const file = join(opts.dir, 'source.webm');
          await writeFile(file, 'webm audio');
          return file;
        }),
      ),
    },
    ffmpeg: {
      probe: vi.fn(async (file: string) => probe(file.endsWith('.webm') ? 'opus' : file.endsWith('.mp3') ? 'mp3' : 'opus')),
      convert: vi.fn(
        track('convert', async (_input: string, output: string) => {
          await writeFile(output, 'converted audio');
        }),
      ),
      measureLoudness: vi.fn(async () => -9),
      extractPicture: vi.fn(async (_input: string, _output: string) => {}),
    },
    tagger: { write: vi.fn(track('tag', async () => {})) },
    uploader: { put: vi.fn(track('put', async () => {})) },
    metadata: { lookup: vi.fn(async () => (overrides.metadata === undefined ? metadata : overrides.metadata)) },
    lyrics: { find: vi.fn(async () => ({ plain: 'Line', synced: '[00:01.00] Line' })) },
    events: { publish: vi.fn(async () => {}) },
    fetch: vi.fn(async () => new Response(new Uint8Array(coverImage), { headers: { 'content-type': 'image/png' } })),
    workDir,
    workerId: 'home-pc',
    logger: silentLogger,
  };

  return { job: createItemJob(deps), deps, api, calls };
}

describe('download.item job', () => {
  it('takes a link through every stage and completes the song', async () => {
    const { job, deps, api, calls } = await setup();
    await job.handle({ downloadId: DOWNLOAD_ID, itemId: ITEM_ID }, context);

    expect(calls).toEqual([
      'claimItem',
      'stage:matching',
      'find',
      'reportSource',
      'stage:downloading',
      'download',
      'stage:processing',
      'convert',
      'tag',
      'stage:uploading',
      'uploadUrls',
      'put',
      'put',
      'completeItem',
    ]);
    expect(api.claimItem).toHaveBeenCalledWith(ITEM_ID, { workerId: 'home-pc', attempt: 1 });
    expect(api.reportSource).toHaveBeenCalledWith(ITEM_ID, {
      source: 'youtube',
      sourceId: 'aaaaaaaaaaa',
      sourceUrl: 'https://www.youtube.com/watch?v=aaaaaaaaaaa',
      isrc: 'GBAHS2300001',
      title: 'Houdini',
      artist: 'Dua Lipa',
    });
    expect(deps.metadata.lookup).toHaveBeenCalledWith({ title: 'Houdini', artist: 'Dua Lipa', durationSec: 190, isrc: null, deezerId: undefined });
    // Lyrics are looked up with the studio length, not the video's.
    expect(deps.lyrics.find).toHaveBeenCalledWith({ title: 'Houdini', artist: 'Dua Lipa', album: 'Radical Optimism', durationSec: 185 });
    // The Deezer cover is used before the video thumbnail.
    expect(deps.fetch).toHaveBeenCalledWith('https://cdn.deezer.test/cover.jpg', expect.anything());
    expect(deps.events.publish).toHaveBeenCalledWith(expect.objectContaining({ type: 'download.item.progress', stage: 'downloading', progress: 0.5 }));

    expect(deps.tagger.write).toHaveBeenCalledWith(
      expect.objectContaining({
        codec: 'opus',
        loudnessLufs: -9,
        cover: expect.stringMatching(/cover\.jpg$/),
        tags: expect.objectContaining({ album: 'Radical Optimism' }),
      }),
    );
    expect(api.uploadUrls).toHaveBeenCalledWith(ITEM_ID, { codec: 'opus', hasCover: true });
    expect(api.completeItem).toHaveBeenCalledWith(ITEM_ID, {
      source: { source: 'youtube', sourceId: 'aaaaaaaaaaa', sourceUrl: 'https://www.youtube.com/watch?v=aaaaaaaaaaa' },
      title: 'Houdini',
      artist: 'Dua Lipa',
      album: 'Radical Optimism',
      albumArtist: 'Dua Lipa',
      year: 2024,
      genre: 'Pop',
      trackNumber: 3,
      discNumber: 1,
      isrc: 'GBAHS2300001',
      durationMs: 185_000,
      audio: { codec: 'opus', bitrateKbps: 131, sizeBytes: 'converted audio'.length, sha256: expect.stringMatching(/^[a-f0-9]{64}$/) },
      cover: { color: expect.stringMatching(/^#[0-9a-f]{6}$/) },
      lyrics: { plain: 'Line', synced: '[00:01.00] Line' },
      loudness: { lufs: -9, gainDb: -5 },
    });
    expect(await readdir(workDir)).toEqual([]);
  });

  it('stops before downloading when the song is already in the library', async () => {
    const { job, deps, api } = await setup();
    api.reportSource.mockResolvedValueOnce({ status: 'duplicate', songId: SONG_ID } as never);
    await job.handle({ downloadId: DOWNLOAD_ID, itemId: ITEM_ID }, context);

    expect(deps.ytdlp.download).not.toHaveBeenCalled();
    expect(api.completeItem).not.toHaveBeenCalled();
    expect(await readdir(workDir)).toEqual([]);
  });

  it('does nothing when the claim says to skip', async () => {
    const { job, deps, api } = await setup();
    api.claimItem.mockResolvedValueOnce({ status: 'skip', reason: 'Item is completed' } as never);
    await job.handle({ downloadId: DOWNLOAD_ID, itemId: ITEM_ID }, context);

    expect(deps.sources.find).not.toHaveBeenCalled();
    expect(api.setStage).not.toHaveBeenCalled();
  });

  it('stops quietly when the item is cancelled part way', async () => {
    const { job, deps, api } = await setup();
    api.setStage.mockImplementation(async (_id, stage) => {
      if (stage === 'processing') throw new ApiError(409, 'conflict', 'Item is cancelled');
    });
    await expect(job.handle({ downloadId: DOWNLOAD_ID, itemId: ITEM_ID }, context)).resolves.toBeUndefined();

    expect(deps.ffmpeg.convert).not.toHaveBeenCalled();
    expect(await readdir(workDir)).toEqual([]);
  });

  it('throws other errors so the job is retried, and still cleans up', async () => {
    const { job, deps } = await setup();
    deps.ytdlp.download.mockRejectedValueOnce(new Error('HTTP Error 403: Forbidden'));
    await expect(job.handle({ downloadId: DOWNLOAD_ID, itemId: ITEM_ID }, context)).rejects.toThrow('403');
    expect(await readdir(workDir)).toEqual([]);
  });

  it('uses an uploaded file directly, with its own cover art', async () => {
    const found = youtubeSource({
      ref: { source: 'upload', sourceId: 'f'.repeat(64), sourceUrl: null },
      downloadUrl: null,
      file: join(workDir, 'input.mp3'),
      hasEmbeddedPicture: true,
      thumbnailUrl: null,
    });
    const { job, deps, api, calls } = await setup({ found, metadata: null });
    deps.ffmpeg.extractPicture.mockImplementationOnce(async (_input: string, output: string) => {
      await writeFile(
        output,
        await sharp({ create: { width: 600, height: 600, channels: 3, background: '#ff0000' } })
          .jpeg()
          .toBuffer(),
      );
    });
    await job.handle({ downloadId: DOWNLOAD_ID, itemId: ITEM_ID }, context);

    expect(calls).not.toContain('stage:downloading');
    expect(deps.ytdlp.download).not.toHaveBeenCalled();
    expect(deps.ffmpeg.extractPicture).toHaveBeenCalledWith(join(workDir, 'input.mp3'), expect.stringMatching(/embedded\.jpg$/));
    expect(api.completeItem).toHaveBeenCalledWith(ITEM_ID, expect.objectContaining({ source: found.ref, audio: expect.objectContaining({ codec: 'mp3' }) }));
  });

  it('skips the optional steps that are turned off', async () => {
    const item = claimed({ options: { ...options, metadata: false, lyrics: false, cover: false } });
    const { job, deps, api } = await setup({ item });
    await job.handle({ downloadId: DOWNLOAD_ID, itemId: ITEM_ID }, context);

    expect(deps.metadata.lookup).not.toHaveBeenCalled();
    expect(deps.lyrics.find).not.toHaveBeenCalled();
    expect(deps.fetch).not.toHaveBeenCalled();
    expect(api.uploadUrls).toHaveBeenCalledWith(ITEM_ID, { codec: 'opus', hasCover: false });
    expect(deps.uploader.put).toHaveBeenCalledOnce();
    expect(api.completeItem).toHaveBeenCalledWith(ITEM_ID, expect.objectContaining({ cover: null, lyrics: null, album: null }));
  });

  it('reports a failure to the API, and never throws while doing so', async () => {
    const { job, api } = await setup();
    const info = { ...context, error: new Error('Video unavailable'), final: true };
    await job.onFailure({ downloadId: DOWNLOAD_ID, itemId: ITEM_ID }, info);
    expect(api.failItem).toHaveBeenCalledWith(ITEM_ID, { error: 'Video unavailable', final: true });

    api.failItem.mockRejectedValueOnce(new Error('API down'));
    await expect(job.onFailure({ downloadId: DOWNLOAD_ID, itemId: ITEM_ID }, info)).resolves.toBeUndefined();
  });
});
