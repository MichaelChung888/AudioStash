import { describe, expect, it } from 'vitest';
import { EXCHANGES, jobTopology, MAX_ATTEMPTS, mergeTopologies, RETRY_DELAYS } from './topology.ts';

describe('jobTopology', () => {
  const topology = jobTopology('download.item');

  it('declares a main queue that dead-letters to the dead exchange', () => {
    const main = topology.queues.find((q) => q.queue === 'pluck.download.item');
    expect(main?.arguments).toMatchObject({ 'x-queue-type': 'quorum', 'x-dead-letter-exchange': EXCHANGES.dead });
  });

  it('declares one retry queue per delay that expires back onto the main queue', () => {
    for (const { label, ms } of RETRY_DELAYS) {
      const retry = topology.queues.find((q) => q.queue === `pluck.download.item.retry.${label}`);
      expect(retry?.arguments).toMatchObject({
        'x-message-ttl': ms,
        'x-dead-letter-exchange': EXCHANGES.jobs,
        'x-dead-letter-routing-key': 'download.item',
      });
    }
    expect(MAX_ATTEMPTS).toBe(RETRY_DELAYS.length + 1);
  });

  it('binds every queue it declares', () => {
    const bound = new Set(topology.queueBindings.map((b) => b.queue));
    for (const q of topology.queues) expect(bound.has(q.queue)).toBe(true);
  });
});

describe('mergeTopologies', () => {
  it('declares shared exchanges once', () => {
    const merged = mergeTopologies([jobTopology('download.item'), jobTopology('download.resolve')]);
    expect(merged.exchanges.map((e) => e.exchange).sort()).toEqual([EXCHANGES.dead, EXCHANGES.jobs, EXCHANGES.retry].sort());
    expect(merged.queues).toHaveLength(10);
  });
});
