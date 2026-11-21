import { describe, expect, it } from 'vitest';
import { formatAgo, formatBytes, formatCompactDuration, formatCount, plural } from './format.ts';

describe('formatBytes', () => {
  it('picks the unit by size', () => {
    expect(formatBytes(512)).toBe('1 KB');
    expect(formatBytes(214_000_000)).toBe('214 MB');
    expect(formatBytes(999_000_000)).toBe('999 MB');
    expect(formatBytes(2_900_000_000)).toBe('2.9 GB');
    expect(formatBytes(123_400_000_000)).toBe('123.4 GB');
  });

  it('moves up a unit when rounding reaches 1000', () => {
    expect(formatBytes(999_600)).toBe('1 MB');
    expect(formatBytes(999_600_000)).toBe('1 GB');
  });

  it('drops a trailing .0', () => {
    expect(formatBytes(2_000_000_000)).toBe('2 GB');
    expect(formatBytes(2_040_000_000)).toBe('2 GB');
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
  const minutes = (count: number) => formatCompactDuration(count * 60_000);

  it('writes min and hr, plural unless one', () => {
    expect(minutes(45)).toBe('45 mins');
    expect(minutes(1)).toBe('1 min');
    expect(minutes(0)).toBe('0 mins');
    expect(minutes(112)).toBe('1 hr 52 mins');
    expect(minutes(121)).toBe('2 hrs 1 min');
    expect(minutes(599)).toBe('9 hrs 59 mins');
  });

  it('drops the minutes on a whole number of hours', () => {
    expect(minutes(120)).toBe('2 hrs');
  });

  it('drops the minutes from 10 hours, rounding to the nearest hour', () => {
    expect(minutes(600)).toBe('10 hrs');
    expect(minutes(277 * 60 + 47)).toBe('278 hrs');
  });
});

describe('formatCount', () => {
  it('shortens thousands and millions', () => {
    expect(formatCount(999)).toBe('999');
    expect(formatCount(58_879)).toBe('58.9K');
    expect(formatCount(123_456)).toBe('123K');
    expect(formatCount(5_241_809)).toBe('5.2M');
  });

  it('moves up a unit when rounding reaches 1000', () => {
    expect(formatCount(999_960)).toBe('1M');
  });

  it('drops a trailing .0', () => {
    expect(formatCount(2_000)).toBe('2K');
  });
});

describe('plural', () => {
  it('adds an s unless the count is one', () => {
    expect(plural(1, 'song')).toBe('1 song');
    expect(plural(31, 'song')).toBe('31 songs');
  });
});
