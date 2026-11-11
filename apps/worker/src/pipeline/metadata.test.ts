import type { DeezerClient, DeezerTrack, DeezerTrackDetail } from '@pluck/catalog';
import { describe, expect, it, vi } from 'vitest';
import { silentLogger } from '../testing/logger.ts';
import { createMetadataLookup } from './metadata.ts';

const searchResult = (overrides: Partial<DeezerTrack> = {}): DeezerTrack => ({
  id: 10,
  title: 'Houdini',
  duration: 185,
  artist: { id: 2, name: 'Dua Lipa' },
  album: { id: 3, title: 'Radical Optimism', cover_xl: 'https://cdn/cover.jpg' },
  ...overrides,
});

const detail = (overrides: Partial<DeezerTrackDetail> = {}): DeezerTrackDetail => ({
  ...searchResult(),
  isrc: 'GBAHS2300001',
  track_position: 3,
  disk_number: 1,
  release_date: '2023-11-09',
  ...overrides,
});

function fakeDeezer(overrides: Partial<DeezerClient> = {}) {
  return {
    track: vi.fn(async () => detail()),
    trackByIsrc: vi.fn(async () => detail()),
    searchTracks: vi.fn(async () => [searchResult()]),
    album: vi.fn(async () => ({
      id: 3,
      title: 'Radical Optimism',
      release_date: '2024-05-03',
      artist: { id: 2, name: 'Dua Lipa' },
      genres: { data: [{ id: 132, name: 'Pop' }] },
    })),
    ...overrides,
  } as unknown as DeezerClient & Record<'track' | 'trackByIsrc' | 'searchTracks' | 'album', ReturnType<typeof vi.fn>>;
}

describe('metadata lookup', () => {
  it('uses the Deezer id when the song came from a Deezer chart', async () => {
    const deezer = fakeDeezer();
    const result = await createMetadataLookup({ deezer, logger: silentLogger }).lookup({ title: 'x', artist: 'y', durationSec: null, deezerId: 10 });

    expect(deezer.track).toHaveBeenCalledWith(10);
    expect(deezer.searchTracks).not.toHaveBeenCalled();
    expect(result).toEqual({
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
    });
  });

  it('uses the ISRC before searching', async () => {
    const deezer = fakeDeezer();
    await createMetadataLookup({ deezer, logger: silentLogger }).lookup({ title: 'x', artist: 'y', durationSec: null, isrc: 'GBAHS2300001' });
    expect(deezer.trackByIsrc).toHaveBeenCalledWith('GBAHS2300001');
    expect(deezer.searchTracks).not.toHaveBeenCalled();
  });

  it('searches by artist and title, without featured artists', async () => {
    const deezer = fakeDeezer();
    const result = await createMetadataLookup({ deezer, logger: silentLogger }).lookup({ title: 'Houdini', artist: 'Dua Lipa ft. Someone', durationSec: 186 });
    expect(deezer.searchTracks).toHaveBeenCalledWith('Dua Lipa Houdini', 10);
    expect(deezer.track).toHaveBeenCalledWith(10);
    expect(result?.title).toBe('Houdini');
  });

  it('returns null when the closest result is a different recording', async () => {
    const deezer = fakeDeezer({ searchTracks: vi.fn(async () => [searchResult({ title: 'Houdini (Live)', duration: 240 })]) });
    const result = await createMetadataLookup({ deezer, logger: silentLogger }).lookup({ title: 'Houdini', artist: 'Dua Lipa', durationSec: 185 });
    expect(result).toBeNull();
  });

  it('does not search with a title alone', async () => {
    const deezer = fakeDeezer();
    await expect(createMetadataLookup({ deezer, logger: silentLogger }).lookup({ title: 'Houdini', artist: null, durationSec: 185 })).resolves.toBeNull();
    expect(deezer.searchTracks).not.toHaveBeenCalled();
  });

  it('returns null instead of throwing when Deezer fails', async () => {
    const deezer = fakeDeezer({ searchTracks: vi.fn(async () => Promise.reject(new Error('down'))) });
    await expect(createMetadataLookup({ deezer, logger: silentLogger }).lookup({ title: 'Houdini', artist: 'Dua Lipa', durationSec: 185 })).resolves.toBeNull();
  });

  it('ignores an unknown release date', async () => {
    const deezer = fakeDeezer({ album: vi.fn(async () => null), track: vi.fn(async () => detail({ release_date: '0000-00-00' })) });
    const result = await createMetadataLookup({ deezer, logger: silentLogger }).lookup({ title: 'x', artist: 'y', durationSec: null, deezerId: 10 });
    expect(result).toMatchObject({ year: null, genre: null, albumArtist: null });
  });
});
