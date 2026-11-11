import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createWorkerStatus } from './worker-status.ts';

const heartbeat = { type: 'worker.heartbeat', workerId: 'pc', version: '1.2.0', concurrency: 2, sentAt: '2026-01-01T00:00:00.000Z' } as const;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('worker status', () => {
  it('starts offline', () => {
    const status = createWorkerStatus({ onChange: vi.fn() });
    expect(status.snapshot()).toEqual({ online: false, lastSeenAt: null, version: null });
    status.stop();
  });

  it('goes online on the first heartbeat and reports only the change', () => {
    const onChange = vi.fn();
    const status = createWorkerStatus({ onChange });

    status.heartbeat(heartbeat);
    status.heartbeat(heartbeat);

    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ online: true, version: '1.2.0' }));
    status.stop();
  });

  it('goes offline after 90 seconds without a heartbeat', () => {
    const onChange = vi.fn();
    const status = createWorkerStatus({ onChange });
    status.heartbeat(heartbeat);

    vi.advanceTimersByTime(90_000);
    expect(status.snapshot().online).toBe(true);

    vi.advanceTimersByTime(15_000);
    expect(status.snapshot().online).toBe(false);
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ online: false }));
    status.stop();
  });

  it('stays online while heartbeats keep arriving', () => {
    const status = createWorkerStatus({ onChange: vi.fn() });
    for (let i = 0; i < 10; i++) {
      status.heartbeat(heartbeat);
      vi.advanceTimersByTime(30_000);
    }
    expect(status.snapshot().online).toBe(true);
    status.stop();
  });
});
