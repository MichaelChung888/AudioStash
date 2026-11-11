import { describe, expect, it } from 'vitest';
import { formatDuration, formatTotalDuration, parseIsoDuration } from './duration.ts';

describe('formatDuration', () => {
  it.each([
    [0, '0:00'],
    [185_000, '3:05'],
    [3_723_000, '1:02:03'],
  ])('%d ms -> %s', (ms, expected) => {
    expect(formatDuration(ms)).toBe(expected);
  });
});

describe('formatTotalDuration', () => {
  it('formats playlist totals in hours and minutes', () => {
    expect(formatTotalDuration(45 * 60_000)).toBe('45 min');
    expect(formatTotalDuration(125 * 60_000)).toBe('2 hr 5 min');
    expect(formatTotalDuration(120 * 60_000)).toBe('2 hr');
  });
});

describe('parseIsoDuration', () => {
  it.each([
    ['PT3M5S', 185],
    ['PT1H2M3S', 3723],
    ['PT45S', 45],
    ['P1DT1S', 86_401],
  ])('%s -> %d', (value, expected) => {
    expect(parseIsoDuration(value)).toBe(expected);
  });

  it.each(['', 'P', 'PT', '3:05'])('rejects %j', (value) => {
    expect(parseIsoDuration(value)).toBeNull();
  });
});
