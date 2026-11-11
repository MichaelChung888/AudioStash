import { type Connection, subscribeEvents } from '@pluck/messaging';
import type { Logger } from '../lib/logger.ts';
import type { SseHub } from './sse-hub.ts';
import type { WorkerStatus } from './worker-status.ts';

// RabbitMQ events -> this instance's SSE connections. Events published by this
// instance come back through here too, so there is one delivery path for all of them.
export function startEventBridge(rabbit: Connection, deps: { sse: SseHub; workerStatus: WorkerStatus; logger: Logger }) {
  return subscribeEvents(rabbit, {
    patterns: ['#'],
    logger: deps.logger,
    handler: (event) => {
      if (event.type === 'worker.heartbeat') deps.workerStatus.heartbeat(event);
      else deps.sse.broadcast(event);
    },
  });
}
