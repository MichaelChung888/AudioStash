import { describe, expect, it } from 'vitest';
import { gainToTarget, gainToVolume } from './loudness.ts';

describe('gainToTarget', () => {
  it('computes the gain that brings a song to -14 LUFS', () => {
    expect(gainToTarget(-8)).toBe(-6);
    expect(gainToTarget(-20)).toBe(6);
  });
});

describe('gainToVolume', () => {
  it('turns loud songs down but never boosts quiet ones', () => {
    expect(gainToVolume(-6)).toBeCloseTo(0.501, 3);
    expect(gainToVolume(0)).toBe(1);
    expect(gainToVolume(6)).toBe(1);
  });
});
