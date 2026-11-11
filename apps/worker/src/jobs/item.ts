import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { ClaimedItem, ItemComplete, JobPayload } from '@pluck/contracts';
import { gainToTarget } from '@pluck/core';
import type { EventPublisher, FailureInfo, JobContext } from '@pluck/messaging';
import { type ApiClient, ApiError } from '../api/client.ts';
import { createProgressReporter } from '../events/progress.ts';
import { describeFile } from '../lib/files.ts';
import type { Logger } from '../lib/logger.ts';
import { type CoverSource, fromUrl, makeCover } from '../pipeline/cover.ts';
import { songDetails } from '../pipeline/details.ts';
import type { FoundSource, SourceFinder } from '../pipeline/find-source.ts';
import { planEncode } from '../pipeline/format.ts';
import type { LyricsLookup } from '../pipeline/lyrics.ts';
import type { MetadataLookup, TrackMetadata } from '../pipeline/metadata.ts';
import type { Ffmpeg } from '../tools/ffmpeg.ts';
import type { Tagger } from '../tools/tagger.ts';
import type { Uploader } from '../tools/upload.ts';
import type { YtDlp } from '../tools/ytdlp.ts';
import { errorMessage } from './errors.ts';

export interface ItemJobDeps {
  api: ApiClient;
  sources: SourceFinder;
  ytdlp: Pick<YtDlp, 'download'>;
  ffmpeg: Pick<Ffmpeg, 'probe' | 'convert' | 'measureLoudness' | 'extractPicture'>;
  tagger: Pick<Tagger, 'write'>;
  uploader: Uploader;
  metadata: MetadataLookup;
  lyrics: LyricsLookup;
  events: Pick<EventPublisher, 'publish'>;
  fetch: typeof fetch;
  workDir: string;
  workerId: string;
  logger: Logger;
}

type Outcome = { status: 'completed'; songId: string } | { status: 'duplicate' | 'skip'; reason: string };

// download.item: turns one link, chart pick or uploaded file into a song in the
// library. Every step that changes state is an API call, so if the worker stops
// half way, the job runs again from the start and the API's claim step makes
// that safe.
//
// Stages, as shown in the app:
//   matching     find the source and its details, and stop early if the song is already in the library
//   downloading  yt-dlp fetches the best audio stream
//   processing   convert, measure loudness, find lyrics and cover, write tags
//   uploading    put the files in the bucket and tell the API the song is ready
export function createItemJob(deps: ItemJobDeps) {
  const { api, logger } = deps;

  async function processItem(item: ClaimedItem, dir: string, log: Logger): Promise<Outcome> {
    const progress = createProgressReporter(deps.events, { downloadId: item.downloadId, itemId: item.id }, log);
    const hint = item.input.kind === 'catalog' ? item.input.hint : null;

    await api.setStage(item.id, 'matching');
    const found = await deps.sources.find(item, dir);
    const metadata = item.options.metadata
      ? await deps.metadata.lookup({
          title: found.track.title,
          artist: found.track.artist,
          durationSec: found.durationSec,
          isrc: found.isrc,
          deezerId: hint?.deezerId,
        })
      : null;
    const details = songDetails(found, metadata);

    const reported = await api.reportSource(item.id, { ...found.ref, isrc: details.isrc, title: details.title, artist: details.artist });
    if (reported.status === 'duplicate') return { status: 'duplicate', reason: `already in the library as ${reported.songId}` };
    if (reported.status === 'skip') return { status: 'skip', reason: reported.reason };

    let input = found.file;
    if (!input) {
      if (!found.downloadUrl) throw new Error('Nothing to download');
      await api.setStage(item.id, 'downloading');
      input = await deps.ytdlp.download(found.downloadUrl, {
        dir,
        removeNonMusic: item.options.removeNonMusic,
        onProgress: (fraction) => progress.report('downloading', fraction),
      });
    }

    await api.setStage(item.id, 'processing');
    const plan = planEncode((await deps.ffmpeg.probe(input)).codec, item.options.format);
    const audioPath = join(dir, `audio.${plan.extension}`);
    await deps.ffmpeg.convert(input, audioPath, plan);

    const [audio, lufs, lyrics, cover] = await Promise.all([
      deps.ffmpeg.probe(audioPath),
      deps.ffmpeg.measureLoudness(audioPath),
      item.options.lyrics
        ? deps.lyrics.find({ title: details.title, artist: details.artist, album: details.album, durationSec: metadata?.durationSec ?? found.durationSec })
        : null,
      item.options.cover ? makeCover(coverSources(found, metadata, hint?.coverUrl ?? null, input, dir), join(dir, 'cover.jpg'), log) : null,
    ]);

    await deps.tagger.write({ path: audioPath, codec: plan.codec, tags: details, lyrics, loudnessLufs: lufs, cover: cover?.path ?? null });
    const file = await describeFile(audioPath);

    await api.setStage(item.id, 'uploading');
    const targets = await api.uploadUrls(item.id, { codec: plan.codec, hasCover: cover !== null });
    await deps.uploader.put(targets.audio, audioPath);
    if (targets.cover && cover) await deps.uploader.put(targets.cover, cover.path);

    const complete: ItemComplete = {
      source: found.ref,
      ...details,
      durationMs: audio.durationMs,
      audio: { codec: plan.codec, bitrateKbps: audio.bitrateKbps, ...file },
      cover: cover ? { color: cover.color } : null,
      lyrics,
      loudness: lufs === null ? null : { lufs, gainDb: gainToTarget(lufs) },
    };
    const { songId } = await api.completeItem(item.id, complete);
    return { status: 'completed', songId };
  }

  // Best first: Deezer's album art, the chart's art, art inside an uploaded file,
  // then the video thumbnail.
  function coverSources(found: FoundSource, metadata: TrackMetadata | null, hintCoverUrl: string | null, input: string, dir: string): CoverSource[] {
    const sources: CoverSource[] = [];
    for (const url of [metadata?.coverUrl, hintCoverUrl]) if (url) sources.push(fromUrl(url, deps.fetch));
    if (found.hasEmbeddedPicture) {
      sources.push({
        name: 'embedded picture',
        async load() {
          const path = join(dir, 'embedded.jpg');
          await deps.ffmpeg.extractPicture(input, path);
          return readFile(path);
        },
      });
    }
    if (found.thumbnailUrl) sources.push(fromUrl(found.thumbnailUrl, deps.fetch));
    return sources;
  }

  return {
    async handle({ itemId }: JobPayload<'download.item'>, context: JobContext): Promise<void> {
      const log = logger.child({ itemId });
      const startedAt = Date.now();
      let dir: string | null = null;
      try {
        const claim = await api.claimItem(itemId, { workerId: deps.workerId, attempt: context.attempt });
        if (claim.status === 'skip') {
          log.info({ reason: claim.reason }, 'item skipped');
          return;
        }
        dir = await mkdtemp(join(deps.workDir, 'item-'));
        const outcome = await processItem(claim.item, dir, log);
        log.info({ ...outcome, ms: Date.now() - startedAt }, 'item finished');
      } catch (error) {
        // The item was cancelled, or its download removed, while it was being worked on.
        if (error instanceof ApiError && error.isGone) {
          log.info({ reason: error.message }, 'item no longer wanted');
          return;
        }
        throw error;
      } finally {
        if (dir) await rm(dir, { recursive: true, force: true });
      }
    },

    async onFailure({ itemId }: JobPayload<'download.item'>, info: FailureInfo): Promise<void> {
      try {
        await api.failItem(itemId, { error: errorMessage(info.error), final: info.final });
      } catch (error) {
        logger.error({ err: error, itemId }, 'could not report the failed item');
      }
    },
  };
}
