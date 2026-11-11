import { randomUUID } from 'node:crypto';
import { RabbitMQContainer, type StartedRabbitMQContainer } from '@testcontainers/rabbitmq';
import type { Connection } from 'rabbitmq-client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRabbit } from './connection.ts';
import { consumeJobs, createJobPublisher, PermanentJobError } from './jobs.ts';
import { deadQueueName, retryQueueName } from './topology.ts';

const silent = { debug() {}, info() {}, warn() {}, error() {} };

let container: StartedRabbitMQContainer;
let rabbit: Connection;

beforeAll(async () => {
  container = await new RabbitMQContainer('rabbitmq:4.4-management-alpine').start();
  // getAmqpUrl() has no credentials, and rabbitmq-client then logs in as a blank user.
  const url = new URL(container.getAmqpUrl());
  url.username = 'guest';
  url.password = 'guest';
  rabbit = createRabbit(url.href, { name: 'test', logger: silent });
  await rabbit.onConnect(10_000);
});

afterAll(async () => {
  await rabbit?.close();
  await container?.stop();
});

const messageCount = async (queue: string) => (await rabbit.queueDeclare({ queue, passive: true })).messageCount;

const waitFor = async (check: () => Promise<boolean>, timeoutMs = 10_000) => {
  const start = Date.now();
  while (!(await check())) {
    if (Date.now() - start > timeoutMs) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 100));
  }
};

describe('jobs', () => {
  it('delivers a published job to its handler', async () => {
    const publisher = createJobPublisher(rabbit);
    const received: string[] = [];
    const sub = consumeJobs(rabbit, 'download.resolve', {
      concurrency: 1,
      logger: silent,
      handler: async (payload) => {
        received.push(payload.downloadId);
      },
    });

    const downloadId = randomUUID();
    await publisher.publish('download.resolve', { downloadId }, { messageId: randomUUID() });
    await waitFor(async () => received.includes(downloadId));

    await sub.close();
    await publisher.close();
  });

  it('sends a failed attempt to the first retry queue and reports it as not final', async () => {
    const publisher = createJobPublisher(rabbit);
    const failures: boolean[] = [];
    const sub = consumeJobs(rabbit, 'download.item', {
      concurrency: 1,
      logger: silent,
      handler: async () => {
        throw new Error('network down');
      },
      onFailure: async (_payload, info) => {
        failures.push(info.final);
      },
    });

    await publisher.publish('download.item', { downloadId: randomUUID(), itemId: randomUUID() }, { messageId: randomUUID() });
    await waitFor(async () => (await messageCount(retryQueueName('download.item', '30s'))) === 1);
    expect(failures).toEqual([false]);

    await sub.close();
    await publisher.close();
  });

  it('acknowledges a permanent failure without retrying', async () => {
    const publisher = createJobPublisher(rabbit);
    const failures: boolean[] = [];
    const sub = consumeJobs(rabbit, 'download.item', {
      concurrency: 1,
      logger: silent,
      handler: async () => {
        throw new PermanentJobError('video unavailable');
      },
      onFailure: async (_payload, info) => {
        failures.push(info.final);
      },
    });

    const retriesBefore = await messageCount(retryQueueName('download.item', '30s'));
    await publisher.publish('download.item', { downloadId: randomUUID(), itemId: randomUUID() }, { messageId: randomUUID() });
    await waitFor(async () => failures.length === 1);
    expect(failures).toEqual([true]);
    expect(await messageCount(retryQueueName('download.item', '30s'))).toBe(retriesBefore);

    await sub.close();
    await publisher.close();
  });

  it('moves a message with an invalid payload to the dead queue', async () => {
    const sub = consumeJobs(rabbit, 'download.resolve', { concurrency: 1, logger: silent, handler: async () => {} });
    const raw = rabbit.createPublisher({ confirm: true });
    await raw.send({ exchange: 'pluck.jobs', routingKey: 'download.resolve' }, { downloadId: 'not-a-uuid' });
    await waitFor(async () => (await messageCount(deadQueueName('download.resolve'))) === 1);

    await sub.close();
    await raw.close();
  });
});
