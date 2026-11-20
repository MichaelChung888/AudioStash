import { describe, expect, it } from 'vitest';
import { nextRepeatMode, playCountsAt, playOrder, startQueue } from './queue.ts';

describe('playOrder', () => {
  it('keeps the list order without shuffle', () => {
    expect(playOrder(4, 2, false)).toEqual([0, 1, 2, 3]);
  });

  it('starts with the chosen song and includes every song once with shuffle', () => {
    const order = playOrder(10, 7, true);
    expect(order[0]).toBe(7);
    expect([...order].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('uses the random source it is given', () => {
    expect(playOrder(4, 0, true, () => 0)).toEqual([0, 2, 3, 1]);
  });
});

describe('startQueue', () => {
  it('starts at the chosen song in list order without shuffle', () => {
    expect(startQueue(4, 2, false)).toEqual({ order: [0, 1, 2, 3], position: 2 });
  });

  it('starts at the front with shuffle, where the chosen song is', () => {
    expect(startQueue(4, 2, true, () => 0)).toEqual({ order: [2, 1, 3, 0], position: 0 });
  });
});

describe('nextRepeatMode', () => {
  it('cycles none, all, single', () => {
    expect(nextRepeatMode('none')).toBe('all');
    expect(nextRepeatMode('all')).toBe('single');
    expect(nextRepeatMode('single')).toBe('none');
  });
});

describe('playCountsAt', () => {
  it('counts a play after 30 seconds, or half of a short song', () => {
    expect(playCountsAt(200)).toBe(30);
    expect(playCountsAt(40)).toBe(20);
  });
});
