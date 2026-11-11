import { describe, expect, it } from 'vitest';
import { songDetails } from './details.ts';
import type { TrackMetadata } from './metadata.ts';

const found = { track: { title: 'Houdini (Official Video)', artist: 'Dua Lipa', album: null, year: 2023 }, isrc: null };

const metadata: TrackMetadata = {
  title: 'Houdini',
  artist: 'Dua Lipa',
  album: 'Radical Optimism',
  albumArtist: 'Dua Lipa',
  year: 2024,
  genre: 'Pop',
  trackNumber: 3,
  discNumber: 1,
  isrc: 'GBAHS2300001',
  durationSec: 185,
  coverUrl: 'https://cdn/cover.jpg',
};

describe('songDetails', () => {
  it('uses the metadata match when there is one', () => {
    expect(songDetails(found, metadata)).toEqual({
      title: 'Houdini',
      artist: 'Dua Lipa',
      album: 'Radical Optimism',
      albumArtist: 'Dua Lipa',
      year: 2024,
      genre: 'Pop',
      trackNumber: 3,
      discNumber: 1,
      isrc: 'GBAHS2300001',
    });
  });

  it('keeps the source details otherwise', () => {
    expect(songDetails({ ...found, isrc: 'USRC17607839' }, null)).toEqual({
      title: 'Houdini (Official Video)',
      artist: 'Dua Lipa',
      album: null,
      albumArtist: null,
      year: 2023,
      genre: null,
      trackNumber: null,
      discNumber: null,
      isrc: 'USRC17607839',
    });
  });

  it('fills a missing artist and trims long values to the API limits', () => {
    const details = songDetails({ track: { title: 'x'.repeat(400), artist: null, album: '  ', year: null }, isrc: null }, null);
    expect(details.title).toHaveLength(300);
    expect(details.artist).toBe('Unknown artist');
    expect(details.album).toBeNull();
  });
});
