import { describe, expect, it } from 'vitest';
import { formatAgo, formatBytes, formatCompactDuration, plural } from './format.ts';

describe('formatBytes', () => {
  it('picks the unit by size', () => {
    expect(formatBytes(512)).toBe('1 KB');
    expect(formatBytes(214_000_000)).toBe('214 MB');
    expect(formatBytes(2_900_000_000)).toBe('2.9 GB');
  });
});

describe('formatAgo', () => {
  const now = Date.parse('2026-11-11T12:00:00Z');

  it('counts seconds, minutes, hours and days', () => {
    expect(formatAgo('2026-11-11T11:59:55Z', now)).toBe('5 s ago');
    expect(formatAgo('2026-11-11T11:30:00Z', now)).toBe('30 min ago');
    expect(formatAgo('2026-11-11T09:00:00Z', now)).toBe('3 h ago');
    expect(formatAgo('2026-11-10T12:00:00Z', now)).toBe('yesterday');
    expect(formatAgo('2026-11-08T12:00:00Z', now)).toBe('3 days ago');
  });

  it('never shows a negative age when the phone clock is behind', () => {
    expect(formatAgo('2026-11-11T12:00:30Z', now)).toBe('0 s ago');
  });
});

describe('formatCompactDuration', () => {
  it('drops the hours when there are none', () => {
    expect(formatCompactDuration(45 * 60_000)).toBe('45 m');
    expect(formatCompactDuration(112 * 60_000)).toBe('1 h 52 m');
  });
});

describe('plural', () => {
  it('adds an s unless the count is one', () => {
    expect(plural(1, 'song')).toBe('1 song');
    expect(plural(31, 'song')).toBe('31 songs');
  });
});
