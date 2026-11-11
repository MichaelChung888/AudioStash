import type { BusEvent } from '@pluck/contracts';
import { describe, expect, it, vi } from 'vitest';
import { silentLogger } from '../testing/logger.ts';
import { createProgressReporter } from './progress.ts';

function setup() {
  let time = 0;
  const publish = vi.fn(async (_event: BusEvent) => {});
  const reporter = createProgressReporter({ publish }, { downloadId: 'd', itemId: 'i' }, silentLogger, () => time);
  return { reporter, publish, advance: (ms: number) => (time += ms) };
}

describe('progress reporter', () => {
  it('sends at most one update a second for the same stage', () => {
    const { reporter, publish, advance } = setup();
    advance(5_000);
    reporter.report('downloading', 0.1);
    advance(300);
    reporter.report('downloading', 0.2);
    advance(800);
    reporter.report('downloading', 0.3);

    expect(publish.mock.calls.map(([event]) => event)).toEqual([
      { type: 'download.item.progress', downloadId: 'd', itemId: 'i', stage: 'downloading', progress: 0.1 },
      { type: 'download.item.progress', downloadId: 'd', itemId: 'i', stage: 'downloading', progress: 0.3 },
    ]);
  });

  it('always sends a new stage', () => {
    const { reporter, publish, advance } = setup();
    advance(5_000);
    reporter.report('downloading', 0.9);
    reporter.report('processing', null);
    expect(publish).toHaveBeenCalledTimes(2);
  });

  it('ignores publish failures', async () => {
    const publish = vi.fn(() => Promise.reject(new Error('disconnected')));
    const reporter = createProgressReporter({ publish }, { downloadId: 'd', itemId: 'i' }, silentLogger);
    expect(() => reporter.report('downloading', 0.5)).not.toThrow();
    await Promise.resolve();
  });
});
