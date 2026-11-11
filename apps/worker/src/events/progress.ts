import type { ItemStage } from '@pluck/contracts';
import type { EventPublisher } from '@pluck/messaging';
import type { Logger } from '../lib/logger.ts';

export interface ProgressReporter {
  report(stage: ItemStage, progress: number | null): void;
}

const MIN_INTERVAL_MS = 1000;

// Sends download progress to the phones through the events exchange. yt-dlp
// reports progress many times a second, so updates are limited to one a second,
// except that a new stage is always sent at once.
//
// Progress goes over RabbitMQ rather than the API, so it never adds a database write.
export function createProgressReporter(
  publisher: Pick<EventPublisher, 'publish'>,
  ids: { downloadId: string; itemId: string },
  logger: Logger,
  now: () => number = Date.now,
): ProgressReporter {
  let lastStage: ItemStage | null = null;
  let lastSentAt = 0;

  return {
    report(stage, progress) {
      const time = now();
      if (stage === lastStage && time - lastSentAt < MIN_INTERVAL_MS) return;
      lastStage = stage;
      lastSentAt = time;
      publisher.publish({ type: 'download.item.progress', ...ids, stage, progress }).catch((error: unknown) => {
        logger.debug({ err: error }, 'progress event not sent');
      });
    },
  };
}
