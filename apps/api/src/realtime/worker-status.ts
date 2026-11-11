import type { BusEvent } from '@pluck/contracts';

type Heartbeat = Extract<BusEvent, { type: 'worker.heartbeat' }>;

export interface WorkerSnapshot {
  online: boolean;
  lastSeenAt: string | null;
  version: string | null;
}

// The worker sends a heartbeat every 30 seconds. Three missed heartbeats and it
// counts as offline: the PC is asleep, off, or lost its connection.
const OFFLINE_AFTER_MS = 90_000;
const CHECK_EVERY_MS = 15_000;

export function createWorkerStatus(options: { onChange: (snapshot: WorkerSnapshot) => void }) {
  let online = false;
  let lastSeenAt: Date | null = null;
  let version: string | null = null;

  const snapshot = (): WorkerSnapshot => ({ online, lastSeenAt: lastSeenAt?.toISOString() ?? null, version });
  const setOnline = (value: boolean) => {
    if (online === value) return;
    online = value;
    options.onChange(snapshot());
  };

  const timer = setInterval(() => {
    if (online && lastSeenAt && Date.now() - lastSeenAt.getTime() > OFFLINE_AFTER_MS) setOnline(false);
  }, CHECK_EVERY_MS);
  timer.unref();

  return {
    heartbeat(event: Heartbeat) {
      // The receive time, not event.sentAt: the PC's clock may not match the server's.
      lastSeenAt = new Date();
      version = event.version;
      setOnline(true);
    },
    snapshot,
    stop: () => clearInterval(timer),
  };
}

export type WorkerStatus = ReturnType<typeof createWorkerStatus>;
