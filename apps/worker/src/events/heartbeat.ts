import type { EventPublisher } from '@pluck/messaging';
import type { Logger } from '../lib/logger.ts';

// The API marks the worker offline after 90 seconds without a heartbeat, so a
// 30-second interval allows two to be lost before the phone shows it offline.
const INTERVAL_MS = 30_000;

export function startHeartbeat(publisher: EventPublisher, info: { workerId: string; version: string; concurrency: number }, logger: Logger): { stop(): void } {
  const send = () => {
    publisher.publish({ type: 'worker.heartbeat', ...info, sentAt: new Date().toISOString() }).catch((error: unknown) => {
      logger.warn({ err: error }, 'heartbeat not sent');
    });
  };

  send();
  const timer = setInterval(send, INTERVAL_MS);
  return { stop: () => clearInterval(timer) };
}
