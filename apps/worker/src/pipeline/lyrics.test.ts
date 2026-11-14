import type { LrclibClient, LrclibLyrics } from '@audiostash/catalog';
import { describe, expect, it } from 'vitest';
import { silentLogger } from '../testing/logger.ts';
import { createLyricsLookup } from './lyrics.ts';

const found = (overrides: Partial<LrclibLyrics>): LrclibLyrics => ({
  id: 1,
  trackName: 'Houdini',
  artistName: 'Dua Lipa',
  instrumental: false,
  plainLyrics: null,
  syncedLyrics: null,
  ...overrides,
});

const lookup = (result: LrclibLyrics | null | Error) =>
  createLyricsLookup({
    lrclib: { find: async () => (result instanceof Error ? Promise.reject(result) : result) } satisfies LrclibClient,
    logger: silentLogger,
  });

const query = { title: 'Houdini', artist: 'Dua Lipa' };

describe('lyrics lookup', () => {
  it('keeps both plain and synced lyrics', async () => {
    await expect(lookup(found({ plainLyrics: 'Line one', syncedLyrics: '[00:01.00] Line one' })).find(query)).resolves.toEqual({
      plain: 'Line one',
      synced: '[00:01.00] Line one',
    });
  });

  it('makes plain lyrics from synced ones when only those exist', async () => {
    await expect(lookup(found({ syncedLyrics: '[00:01.00] One\n[00:02.00] Two' })).find(query)).resolves.toEqual({
      plain: 'One\nTwo',
      synced: '[00:01.00] One\n[00:02.00] Two',
    });
  });

  it('returns null for instrumentals, no match and errors', async () => {
    await expect(lookup(found({ instrumental: true })).find(query)).resolves.toBeNull();
    await expect(lookup(found({ plainLyrics: '  ' })).find(query)).resolves.toBeNull();
    await expect(lookup(null).find(query)).resolves.toBeNull();
    await expect(lookup(new Error('down')).find(query)).resolves.toBeNull();
  });
});
