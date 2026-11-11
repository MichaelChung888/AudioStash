import { afterEach, describe, expect, it, vi } from 'vitest';
import { TtlCache } from './ttl-cache.ts';

afterEach(() => {
  vi.useRealTimers();
});

describe('TtlCache', () => {
  it('serves a cached value until it expires', async () => {
    vi.useFakeTimers();
    const cache = new TtlCache<number>({ ttlMs: 1_000 });
    const load = vi.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(2);

    await expect(cache.get('k', load)).resolves.toBe(1);
    await expect(cache.get('k', load)).resolves.toBe(1);
    vi.advanceTimersByTime(1_001);
    await expect(cache.get('k', load)).resolves.toBe(2);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('shares one load between concurrent callers', async () => {
    const cache = new TtlCache<string>({ ttlMs: 1_000 });
    const { promise, resolve } = Promise.withResolvers<string>();
    const load = vi.fn(() => promise);

    const first = cache.get('k', load);
    const second = cache.get('k', load);
    resolve('value');

    await expect(Promise.all([first, second])).resolves.toEqual(['value', 'value']);
    expect(load).toHaveBeenCalledOnce();
  });

  it('does not cache a failed load', async () => {
    const cache = new TtlCache<string>({ ttlMs: 1_000 });
    const load = vi.fn().mockRejectedValueOnce(new Error('down')).mockResolvedValueOnce('ok');

    await expect(cache.get('k', load)).rejects.toThrow('down');
    await expect(cache.get('k', load)).resolves.toBe('ok');
  });

  it('skips values the caller says not to cache', async () => {
    const cache = new TtlCache<string[]>({ ttlMs: 1_000 });
    const load = vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce(['a']);
    const nonEmpty = (list: string[]) => list.length > 0;

    await expect(cache.get('k', load, nonEmpty)).resolves.toEqual([]);
    await expect(cache.get('k', load, nonEmpty)).resolves.toEqual(['a']);
  });

  it('drops the oldest entry when full', async () => {
    const cache = new TtlCache<string>({ ttlMs: 1_000, maxEntries: 2 });
    await cache.get('a', async () => 'a');
    await cache.get('b', async () => 'b');
    await cache.get('c', async () => 'c');

    const reload = vi.fn(async () => 'a2');
    await expect(cache.get('a', reload)).resolves.toBe('a2');
    await expect(cache.get('c', reload)).resolves.toBe('c');
  });
});
