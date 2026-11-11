import { Connection } from 'rabbitmq-client';
import type { Logger } from './logger.ts';

// One TCP connection per process. rabbitmq-client reconnects on its own and
// re-runs every publisher's and consumer's declarations after a reconnect.
export function createRabbit(url: string, options: { name: string; logger: Logger }): Connection {
  const rabbit = new Connection({
    url,
    connectionName: options.name,
    // Back off between 1s and 30s while the broker is unreachable (e.g. the home PC lost Wi-Fi).
    retryLow: 1_000,
    retryHigh: 30_000,
  });
  rabbit.on('connection', () => options.logger.info({}, 'rabbitmq connected'));
  rabbit.on('error', (err) => options.logger.error({ err }, 'rabbitmq connection error'));
  rabbit.on('connection.blocked', (reason) => options.logger.warn({ reason }, 'rabbitmq blocked publishing'));
  rabbit.on('connection.unblocked', () => options.logger.info({}, 'rabbitmq unblocked publishing'));
  return rabbit;
}

export type { Connection };
