import { describe, expect, it } from 'vitest';
import { type MatchCandidate, pickBestMatch, scoreCandidate } from './match.ts';

const target = { title: 'Houdini', artist: 'Dua Lipa', durationSec: 185 };

const official: MatchCandidate = { id: 'a', title: 'Houdini', channel: 'Dua Lipa - Topic', durationSec: 186 };
const video: MatchCandidate = { id: 'b', title: 'Dua Lipa - Houdini (Official Music Video)', channel: 'Dua Lipa', durationSec: 228 };
const sped: MatchCandidate = { id: 'c', title: 'Dua Lipa - Houdini (sped up)', channel: 'fan uploads', durationSec: 150 };
const live: MatchCandidate = { id: 'd', title: 'Dua Lipa - Houdini (Live at Glastonbury)', channel: 'BBC Music', durationSec: 190 };
const unrelated: MatchCandidate = { id: 'e', title: 'Harry Houdini documentary', channel: 'History', durationSec: 2400 };

describe('scoreCandidate', () => {
  it('prefers the official audio upload with the right length', () => {
    expect(scoreCandidate(target, official)).toBeGreaterThan(scoreCandidate(target, video));
  });

  it("prefers the artist's own upload over a re-upload with a closer length", () => {
    const own: MatchCandidate = { id: 'g', title: 'Dua Lipa - Houdini (Official Music Video)', channel: 'Dua Lipa', durationSec: 189 };
    const reupload: MatchCandidate = { id: 'h', title: 'Dua Lipa - Houdini', channel: 'LatinHype', durationSec: 186 };
    expect(pickBestMatch(target, [reupload, own])?.id).toBe('g');
  });

  it('penalises other versions of the song', () => {
    expect(scoreCandidate(target, sped)).toBeLessThan(0.6);
    expect(scoreCandidate(target, live)).toBeLessThan(scoreCandidate(target, official));
  });

  it('does not penalise a version the target asks for', () => {
    const remixTarget = { title: 'Houdini (Remix)', artist: 'Dua Lipa' };
    const remix: MatchCandidate = { id: 'f', title: 'Dua Lipa - Houdini (Remix)', channel: 'Dua Lipa', durationSec: 200 };
    expect(scoreCandidate(remixTarget, remix)).toBeGreaterThanOrEqual(0.6);
  });
});

describe('pickBestMatch', () => {
  it('returns the highest scoring candidate', () => {
    expect(pickBestMatch(target, [unrelated, sped, video, official])?.id).toBe('a');
  });

  it('returns null when nothing is close enough', () => {
    expect(pickBestMatch(target, [unrelated])).toBeNull();
    expect(pickBestMatch(target, [])).toBeNull();
  });
});
