import { JOB_NAMES, JOB_SCHEMAS, type JobName, type JobPayload } from '@audiostash/contracts';
import { type AsyncMessage, type Connection, ConsumerStatus } from 'rabbitmq-client';
import type { Logger } from './logger.ts';
import { EXCHANGES, jobTopology, MAX_ATTEMPTS, mergeTopologies, queueName, RETRY_DELAYS, retryRoutingKey } from './topology.ts';

const ATTEMPT_HEADER = 'x-audiostash-attempt';

// Throw this from a job handler when retrying cannot help, e.g. the video was deleted.
export class PermanentJobError extends Error {
  override name = 'PermanentJobError';
}

export interface JobContext {
  messageId: string;
  attempt: number;
  isLastAttempt: boolean;
}

export interface FailureInfo extends JobContext {
  error: unknown;
  // True when no retry will follow, either because the error is permanent or attempts ran out.
  final: boolean;
}

export interface JobPublisher {
  publish<N extends JobName>(job: N, payload: JobPayload<N>, options: { messageId: string }): Promise<void>;
  close(): Promise<void>;
}

export function createJobPublisher(rabbit: Connection): JobPublisher {
  const publisher = rabbit.createPublisher({
    // Wait for the broker to confirm each message is stored before resolving.
    confirm: true,
    maxAttempts: 3,
    ...mergeTopologies(JOB_NAMES.map(jobTopology)),
  });

  return {
    async publish(job, payload, { messageId }) {
      await publisher.send(
        { exchange: EXCHANGES.jobs, routingKey: job, messageId, durable: true, contentType: 'application/json', headers: { [ATTEMPT_HEADER]: 1 } },
        payload,
      );
    },
    close: () => publisher.close(),
  };
}

export interface ConsumeJobsOptions<N extends JobName> {
  concurrency: number;
  logger: Logger;
  handler: (payload: JobPayload<N>, context: JobContext) => Promise<void>;
  // Called before the message is retried or given up on, so the caller can record the failure.
  onFailure?: (payload: JobPayload<N>, info: FailureInfo) => Promise<void>;
}

// Delivery is at least once: a message can arrive twice (for example if the
// process dies after finishing the work but before acknowledging). Handlers must
// be safe to run twice; ours are, because the API's claim step is idempotent.
export function consumeJobs<N extends JobName>(rabbit: Connection, job: N, options: ConsumeJobsOptions<N>) {
  const log = options.logger;
  const topology = jobTopology(job);
  const retryPublisher = rabbit.createPublisher({ confirm: true, maxAttempts: 3 });

  const consumer = rabbit.createConsumer(
    {
      queue: queueName(job),
      queueOptions: topology.queues[0],
      exchanges: topology.exchanges,
      queueBindings: topology.queueBindings,
      // Prefetch one message per free slot, so a second worker PC would share the load fairly.
      qos: { prefetchCount: options.concurrency },
      concurrency: options.concurrency,
    },
    async (msg) => {
      const messageId = msg.messageId ?? 'unknown';
      const attempt = readAttempt(msg);
      const context: JobContext = { messageId, attempt, isLastAttempt: attempt >= MAX_ATTEMPTS };

      const parsed = JOB_SCHEMAS[job].safeParse(msg.body);
      if (!parsed.success) {
        log.error({ job, messageId, issues: parsed.error.issues }, 'invalid job payload, moving to dead queue');
        return ConsumerStatus.DROP;
      }
      const payload = parsed.data as JobPayload<N>;

      try {
        await options.handler(payload, context);
        return ConsumerStatus.ACK;
      } catch (error) {
        const permanent = error instanceof PermanentJobError;
        const final = permanent || context.isLastAttempt;
        log.warn({ job, messageId, attempt, permanent, final, err: error }, 'job attempt failed');

        await options.onFailure?.(payload, { ...context, error, final });

        if (permanent) return ConsumerStatus.ACK;
        if (final) return ConsumerStatus.DROP;

        const delay = RETRY_DELAYS[attempt - 1] ?? RETRY_DELAYS[RETRY_DELAYS.length - 1];
        if (!delay) return ConsumerStatus.DROP;
        await retryPublisher.send(
          {
            exchange: EXCHANGES.retry,
            routingKey: retryRoutingKey(job, delay.label),
            messageId,
            durable: true,
            contentType: 'application/json',
            headers: { [ATTEMPT_HEADER]: attempt + 1 },
          },
          payload,
        );
        return ConsumerStatus.ACK;
      }
    },
  );

  consumer.on('error', (err) => log.error({ job, err }, 'job consumer error'));

  return {
    consumer,
    async close() {
      await consumer.close();
      await retryPublisher.close();
    },
  };
}

function readAttempt(msg: AsyncMessage): number {
  const value = Number(msg.headers?.[ATTEMPT_HEADER]);
  return Number.isInteger(value) && value > 0 ? value : 1;
}
