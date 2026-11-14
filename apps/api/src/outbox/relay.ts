import type { JobName, JobPayload } from '@audiostash/contracts';
import type { Database } from '@audiostash/db';
import type { JobPublisher } from '@audiostash/messaging';
import * as outboxDb from '../db/outbox.ts';
import { withTimeout } from '../lib/concurrency.ts';
import type { Logger } from '../lib/logger.ts';

interface Options {
  db: Database;
  publisher: JobPublisher;
  logger: Logger;
  pollIntervalMs?: number;
  batchSize?: number;
}

const PUBLISH_TIMEOUT_MS = 10_000;
const CLEANUP_INTERVAL_MS = 60 * 60_000;
const KEEP_PUBLISHED_MS = 7 * 24 * 60 * 60_000;

// Moves job rows from the outbox table to RabbitMQ.
//
// Services write a job in the same transaction as the state it belongs to, then
// call kick() after commit for low latency. The poll catches anything a kick
// missed: a crash after commit, or RabbitMQ being down at the time.
//
// A row is marked published only after the broker confirms it, so a crash in
// between publishes it again. Consumers handle duplicates.
export function createOutboxRelay({ db, publisher, logger, pollIntervalMs = 1_000, batchSize = 100 }: Options) {
  let draining: Promise<void> | null = null;
  let drainAgain = false;
  const timers: NodeJS.Timeout[] = [];

  // Returns true when the batch was full, meaning more rows may be waiting.
  async function publishBatch(): Promise<boolean> {
    return db.transaction(async (tx) => {
      const rows = await outboxDb.lockUnpublished(tx, batchSize);
      const published: number[] = [];
      for (const row of rows) {
        try {
          await withTimeout(
            publisher.publish(row.job, row.payload as JobPayload<JobName>, { messageId: row.messageId }),
            PUBLISH_TIMEOUT_MS,
            'publish timed out',
          );
          published.push(row.id);
        } catch (err) {
          await outboxDb.markFailed(tx, row.id, err instanceof Error ? err.message : String(err));
          logger.warn({ err, outboxId: row.id, job: row.job }, 'outbox publish failed, will retry');
          break;
        }
      }
      await outboxDb.markPublished(tx, published);
      return published.length === batchSize;
    });
  }

  function kick(): void {
    if (draining) {
      drainAgain = true;
      return;
    }
    draining = (async () => {
      try {
        do {
          drainAgain = false;
          while (await publishBatch());
        } while (drainAgain);
      } catch (err) {
        logger.error({ err }, 'outbox drain failed');
      } finally {
        draining = null;
      }
    })();
  }

  async function cleanup(): Promise<void> {
    try {
      const deleted = await outboxDb.deletePublishedBefore(db, new Date(Date.now() - KEEP_PUBLISHED_MS));
      if (deleted > 0) logger.info({ deleted }, 'removed old outbox rows');
    } catch (err) {
      logger.warn({ err }, 'outbox cleanup failed');
    }
  }

  return {
    start() {
      timers.push(
        setInterval(kick, pollIntervalMs),
        setInterval(() => void cleanup(), CLEANUP_INTERVAL_MS),
      );
      kick();
    },
    kick,
    async stop() {
      for (const timer of timers) clearInterval(timer);
      await draining;
    },
  };
}

export type OutboxRelay = ReturnType<typeof createOutboxRelay>;
