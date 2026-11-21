import { describe, expect, it } from 'vitest';
import { playerBackground } from './tint.ts';

describe('playerBackground', () => {
  it('darkens the cover colour to a quarter over near-black', () => {
    expect(playerBackground('#ffffff', '#17122a')).toBe('#48494a');
    expect(playerBackground('#C83C1E', '#17122a')).toBe('#3a1812');
  });

  it('falls back without a usable colour', () => {
    expect(playerBackground(null, '#17122a')).toBe('#17122a');
    expect(playerBackground('red', '#17122a')).toBe('#17122a');
    expect(playerBackground('#fff', '#17122a')).toBe('#17122a');
  });
});
