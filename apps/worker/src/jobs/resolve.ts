import type { JobPayload } from '@pluck/contracts';
import type { FailureInfo, JobContext } from '@pluck/messaging';
import { type ApiClient, ApiError } from '../api/client.ts';
import type { Logger } from '../lib/logger.ts';
import type { YtDlp } from '../tools/ytdlp.ts';
import { errorMessage } from './errors.ts';

// The API accepts at most this many entries. YouTube playlists can hold 5,000 videos.
const MAX_ENTRIES = 5000;

interface Deps {
  api: ApiClient;
  ytdlp: Pick<YtDlp, 'listCollection'>;
  workerId: string;
  logger: Logger;
}

// download.resolve: turns a playlist, album or profile link into its list of
// songs. The API then creates one item, and one download.item job, per song.
export function createResolveJob({ api, ytdlp, workerId, logger }: Deps) {
  return {
    async handle({ downloadId }: JobPayload<'download.resolve'>, context: JobContext): Promise<void> {
      const log = logger.child({ downloadId });
      try {
        const claim = await api.claimResolve(downloadId, { workerId, attempt: context.attempt });
        if (claim.status === 'skip') {
          log.info({ reason: claim.reason }, 'resolve skipped');
          return;
        }

        const { title, entries } = await ytdlp.listCollection(claim.download.url);
        if (entries.length > MAX_ENTRIES) log.warn({ count: entries.length }, `keeping the first ${MAX_ENTRIES} entries`);
        await api.completeResolve(downloadId, { title, entries: entries.slice(0, MAX_ENTRIES) });
        log.info({ count: Math.min(entries.length, MAX_ENTRIES) }, 'resolved');
      } catch (error) {
        if (error instanceof ApiError && error.isGone) {
          log.info({ reason: error.message }, 'download no longer wanted');
          return;
        }
        throw error;
      }
    },

    async onFailure({ downloadId }: JobPayload<'download.resolve'>, info: FailureInfo): Promise<void> {
      try {
        await api.failResolve(downloadId, { error: errorMessage(info.error), final: info.final });
      } catch (error) {
        logger.error({ err: error, downloadId }, 'could not report the failed resolve');
      }
    },
  };
}
