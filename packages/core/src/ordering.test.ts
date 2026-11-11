import { describe, expect, it } from 'vitest';
import { comparePositions, positionBetween, positionsAfter } from './ordering.ts';

describe('ordering', () => {
  it('creates keys that sort in insertion order', () => {
    const keys = positionsAfter(null, 3);
    expect([...keys].sort(comparePositions)).toEqual(keys);
  });

  it('can always insert between two neighbours', () => {
    const [a, b] = positionsAfter(null, 2) as [string, string];
    const middle = positionBetween(a, b);
    expect(comparePositions(a, middle)).toBe(-1);
    expect(comparePositions(middle, b)).toBe(-1);
  });

  it('appends after the last key', () => {
    const [last] = positionsAfter(null, 1) as [string];
    const [next] = positionsAfter(last, 1) as [string];
    expect(comparePositions(last, next)).toBe(-1);
  });
});
