import { mkdir, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { createDeezerClient, createLrclibClient } from '@pluck/catalog';
import { consumeJobs, createEventPublisher, createRabbit } from '@pluck/messaging';
import pkg from '../package.json' with { type: 'json' };
import { createApiClient } from './api/client.ts';
import type { Env } from './env.ts';
import { startHeartbeat } from './events/heartbeat.ts';
import { createItemJob } from './jobs/item.ts';
import { createResolveJob } from './jobs/resolve.ts';
import type { Logger } from './lib/logger.ts';
import { createSourceFinder } from './pipeline/find-source.ts';
import { createLyricsLookup } from './pipeline/lyrics.ts';
import { createMetadataLookup } from './pipeline/metadata.ts';
import { createFfmpeg } from './tools/ffmpeg.ts';
import { createTagger } from './tools/tagger.ts';
import { createUploader } from './tools/upload.ts';
import { createYtDlp } from './tools/ytdlp.ts';

export interface WorkerContext {
  start(): Promise<void>;
  close(): Promise<void>;
}

// The composition root: creates every connection and tool, and wires them into
// the two job handlers. Nothing else in the worker reads the environment.
export function createContext(env: Env, logger: Logger): WorkerContext {
  const child = (component: string) => logger.child({ component });

  const rabbit = createRabbit(env.RABBITMQ_URL, { name: `pluck-worker@${env.WORKER_ID}`, logger: child('rabbitmq') });
  const events = createEventPublisher(rabbit);
  const api = createApiClient({ baseUrl: env.API_URL, token: env.WORKER_TOKEN, userAgent: `pluck-worker/${pkg.version}` });

  const http = { userAgent: `Pluck/${pkg.version} (personal music library)` };
  const ytdlp = createYtDlp({ path: env.YTDLP_PATH, ffmpegPath: env.FFMPEG_PATH, cookiesFile: env.YTDLP_COOKIES_FILE });
  const ffmpeg = createFfmpeg({ ffmpegPath: env.FFMPEG_PATH, ffprobePath: env.FFPROBE_PATH });
  const tagger = createTagger({ pythonPath: env.PYTHON_PATH });

  const resolveJob = createResolveJob({ api, ytdlp, workerId: env.WORKER_ID, logger: child('resolve') });
  const itemJob = createItemJob({
    api,
    sources: createSourceFinder({ ytdlp, ffmpeg, fetch }),
    ytdlp,
    ffmpeg,
    tagger,
    uploader: createUploader(),
    metadata: createMetadataLookup({ deezer: createDeezerClient(http), logger: child('metadata') }),
    lyrics: createLyricsLookup({ lrclib: createLrclibClient(http), logger: child('lyrics') }),
    events,
    fetch,
    workDir: env.WORK_DIR,
    workerId: env.WORKER_ID,
    logger: child('item'),
  });

  let consumers: { close(): Promise<void> }[] = [];
  let heartbeat: { stop(): void } | null = null;

  return {
    async start() {
      await checkTools(logger, { 'yt-dlp': ytdlp.version, ffmpeg: ffmpeg.version, mutagen: tagger.version });
      await prepareWorkDir(env.WORK_DIR);

      consumers = [
        // A playlist link is listed in one call, so one at a time is enough.
        consumeJobs(rabbit, 'download.resolve', { concurrency: 1, logger: child('jobs'), handler: resolveJob.handle, onFailure: resolveJob.onFailure }),
        consumeJobs(rabbit, 'download.item', {
          concurrency: env.WORKER_CONCURRENCY,
          logger: child('jobs'),
          handler: itemJob.handle,
          onFailure: itemJob.onFailure,
        }),
      ];
      heartbeat = startHeartbeat(events, { workerId: env.WORKER_ID, version: pkg.version, concurrency: env.WORKER_CONCURRENCY }, child('heartbeat'));
      logger.info({ workerId: env.WORKER_ID, concurrency: env.WORKER_CONCURRENCY }, 'worker started');
    },

    // Closing a consumer waits for its running jobs to finish. Messages it had
    // received but not finished go back to the queue for the next start.
    async close() {
      heartbeat?.stop();
      await Promise.all(consumers.map((consumer) => consumer.close()));
      await events.close();
      await rabbit.close();
    },
  };
}

// A missing tool would fail every job, so the worker refuses to start instead.
async function checkTools(logger: Logger, tools: Record<string, () => Promise<string>>): Promise<void> {
  const versions: Record<string, string> = {};
  for (const [name, version] of Object.entries(tools)) {
    try {
      versions[name] = await version();
    } catch (error) {
      throw new Error(`${name} is not available. Install it, or set its path in .env. (${error instanceof Error ? error.message : error})`);
    }
  }
  logger.info(versions, 'tools found');
}

// Removes folders left by jobs that were running when the worker last stopped.
// Only "item-" folders are touched, in case WORK_DIR points somewhere shared.
async function prepareWorkDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
  const leftovers = (await readdir(dir)).filter((name) => name.startsWith('item-'));
  await Promise.all(leftovers.map((name) => rm(join(dir, name), { recursive: true, force: true })));
}
