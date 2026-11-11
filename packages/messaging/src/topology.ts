import type { JobName } from '@pluck/contracts';
import type { PublisherProps } from 'rabbitmq-client';

// Every service declares the topology it uses on connect, and RabbitMQ rejects a
// redeclare with different arguments. Keeping the definitions here, shared by the
// API and the worker, guarantees both sides declare the same thing.

export const EXCHANGES = {
  // Direct: routing key = job name, e.g. "download.item".
  jobs: 'pluck.jobs',
  // Direct: routing key = "<job>.<delay>", e.g. "download.item.2m".
  retry: 'pluck.retry',
  // Direct: routing key = job name. Messages that failed every attempt end up here.
  dead: 'pluck.dead',
  // Topic: routing key = event type, e.g. "download.updated".
  events: 'pluck.events',
} as const;

// Wait before attempt 2, 3 and 4. Attempt 1 runs immediately.
export const RETRY_DELAYS = [
  { label: '30s', ms: 30_000 },
  { label: '2m', ms: 120_000 },
  { label: '10m', ms: 600_000 },
] as const;
export const MAX_ATTEMPTS = RETRY_DELAYS.length + 1;

// Quorum queues count redeliveries. A message that crashes the worker this many
// times is moved to the dead queue instead of looping forever.
const DELIVERY_LIMIT = 10;

export const queueName = (job: JobName) => `pluck.${job}`;
export const deadQueueName = (job: JobName) => `pluck.${job}.dead`;
export const retryQueueName = (job: JobName, label: string) => `pluck.${job}.retry.${label}`;
export const retryRoutingKey = (job: JobName, label: string) => `${job}.${label}`;

type Topology = Required<Pick<PublisherProps, 'exchanges' | 'queues' | 'queueBindings'>>;

export function jobTopology(job: JobName): Topology {
  return {
    exchanges: [
      { exchange: EXCHANGES.jobs, type: 'direct', durable: true },
      { exchange: EXCHANGES.retry, type: 'direct', durable: true },
      { exchange: EXCHANGES.dead, type: 'direct', durable: true },
    ],
    queues: [
      {
        queue: queueName(job),
        durable: true,
        arguments: {
          'x-queue-type': 'quorum',
          'x-delivery-limit': DELIVERY_LIMIT,
          'x-dead-letter-exchange': EXCHANGES.dead,
        },
      },
      // A retry queue has no consumer. Messages wait there until their TTL runs
      // out, then RabbitMQ dead-letters them back onto the main queue.
      ...RETRY_DELAYS.map(({ label, ms }) => ({
        queue: retryQueueName(job, label),
        durable: true,
        arguments: {
          'x-queue-type': 'quorum' as const,
          'x-message-ttl': ms,
          'x-dead-letter-exchange': EXCHANGES.jobs,
          'x-dead-letter-routing-key': job,
          // Without these two, a quorum queue may drop a message while dead-lettering it.
          'x-dead-letter-strategy': 'at-least-once',
          'x-overflow': 'reject-publish' as const,
        },
      })),
      { queue: deadQueueName(job), durable: true, arguments: { 'x-queue-type': 'quorum' } },
    ],
    queueBindings: [
      { exchange: EXCHANGES.jobs, queue: queueName(job), routingKey: job },
      ...RETRY_DELAYS.map(({ label }) => ({ exchange: EXCHANGES.retry, queue: retryQueueName(job, label), routingKey: retryRoutingKey(job, label) })),
      { exchange: EXCHANGES.dead, queue: deadQueueName(job), routingKey: job },
    ],
  };
}

export function mergeTopologies(topologies: Topology[]): Topology {
  const exchanges = new Map(topologies.flatMap((t) => t.exchanges).map((e) => [e.exchange, e]));
  return {
    exchanges: [...exchanges.values()],
    queues: topologies.flatMap((t) => t.queues),
    queueBindings: topologies.flatMap((t) => t.queueBindings),
  };
}

export const eventsExchange = { exchange: EXCHANGES.events, type: 'topic', durable: true } as const;
