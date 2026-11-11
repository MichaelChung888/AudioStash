import { describe, expect, it } from 'vitest';
import { buildPlaylistPath, buildSongPath, sanitizeSegment, withPathSuffix } from './paths.ts';

describe('sanitizeSegment', () => {
  it.each([
    ['AC/DC', 'AC_DC'],
    ['What? Why: "Now"', 'What_ Why_ _Now_'],
    ['  spaced   out  ', 'spaced out'],
    ['.hidden', 'hidden'],
    ['ends with dots...', 'ends with dots'],
    ['CON', '_CON'],
    ['nul.txt', '_nul.txt'],
    ['', 'Unknown'],
    ['???', '___'],
  ])('%j -> %j', (input, expected) => {
    expect(sanitizeSegment(input)).toBe(expected);
  });

  it('keeps names under 120 bytes without splitting a character', () => {
    const result = sanitizeSegment('é'.repeat(100));
    expect(new TextEncoder().encode(result).length).toBeLessThanOrEqual(120);
    expect(result).toBe('é'.repeat(60));
  });
});

describe('buildSongPath', () => {
  it('nests the song file in a folder per artist', () => {
    expect(buildSongPath({ artist: 'Dua Lipa', title: 'Houdini', extension: 'opus' })).toBe('Songs/Dua Lipa/Houdini.opus');
  });

  it('falls back when names are empty', () => {
    expect(buildSongPath({ artist: ' ', title: '', extension: 'mp3' })).toBe('Songs/Unknown Artist/Untitled.mp3');
  });
});

describe('withPathSuffix', () => {
  it('adds the number before the extension', () => {
    expect(withPathSuffix('Songs/A/Title.opus', 2)).toBe('Songs/A/Title (2).opus');
    expect(withPathSuffix('Songs/A.B/Title', 3)).toBe('Songs/A.B/Title (3)');
  });
});

describe('buildPlaylistPath', () => {
  it('puts playlists in their own folder', () => {
    expect(buildPlaylistPath('Gym / Running')).toBe('Playlists/Gym _ Running.m3u8');
  });
});
