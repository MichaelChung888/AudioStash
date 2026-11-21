import { describe, expect, it, vi } from 'vitest';
import { appleArtwork } from './apple.ts';
import { createDeezerClient, DeezerError, deezerImage } from './deezer.ts';
import { HttpError } from './http.ts';
import { createLrclibClient } from './lrclib.ts';
import { createYoutubeClient } from './youtube.ts';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const track = {
  id: 1,
  title: 'Houdini',
  duration: 185,
  artist: { id: 2, name: 'Dua Lipa' },
  album: { id: 3, title: 'Radical Optimism', cover_xl: 'https://cdn/cover.jpg' },
};

describe('deezer client', () => {
  it('parses a chart', async () => {
    const fetch = vi.fn(async () => json({ data: [track], total: 1 }));
    const deezer = createDeezerClient({ userAgent: 'test', fetch });
    await expect(deezer.chart(0, 10)).resolves.toMatchObject([{ title: 'Houdini', artist: { name: 'Dua Lipa' } }]);
    expect(fetch).toHaveBeenCalledWith('https://api.deezer.com/chart/0/tracks?limit=10', expect.anything());
  });

  it('parses the artist chart', async () => {
    const fetch = vi.fn(async () => json({ data: [{ id: 27, name: 'Daft Punk', picture_xl: 'https://cdn/27.jpg' }] }));
    const deezer = createDeezerClient({ userAgent: 'test', fetch });
    await expect(deezer.chartArtists(0, 20)).resolves.toEqual([{ id: 27, name: 'Daft Punk', picture_xl: 'https://cdn/27.jpg' }]);
    expect(fetch).toHaveBeenCalledWith('https://api.deezer.com/chart/0/artists?limit=20', expect.anything());
  });

  it('returns null for a missing artist', async () => {
    const deezer = createDeezerClient({ userAgent: 'test', fetch: async () => json({ error: { type: 'DataException', message: 'no data', code: 800 } }) });
    await expect(deezer.artist(1)).resolves.toBeNull();
  });

  it('treats an error object in a 200 response as an error', async () => {
    const deezer = createDeezerClient({ userAgent: 'test', fetch: async () => json({ error: { type: 'ParameterException', message: 'bad', code: 500 } }) });
    await expect(deezer.searchTracks('x', 1)).rejects.toBeInstanceOf(DeezerError);
  });

  it('returns null for a missing track', async () => {
    const deezer = createDeezerClient({ userAgent: 'test', fetch: async () => json({ error: { type: 'DataException', message: 'no data', code: 800 } }) });
    await expect(deezer.track(0)).resolves.toBeNull();
  });

  it('waits and retries when the quota is exceeded', async () => {
    vi.useFakeTimers();
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(json({ error: { type: 'Exception', message: 'Quota limit exceeded', code: 4 } }))
      .mockResolvedValueOnce(json({ data: [track] }));
    const deezer = createDeezerClient({ userAgent: 'test', fetch });
    const result = deezer.searchTracks('houdini', 1);
    await vi.runAllTimersAsync();
    await expect(result).resolves.toHaveLength(1);
    expect(fetch).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});

describe('deezerImage', () => {
  it('keeps a real picture', () => {
    const url = 'https://cdn-images.dzcdn.net/images/artist/638e69b9caaf9f9f3f8826febea7b543/1000x1000-000000-80-0-0.jpg';
    expect(deezerImage(url)).toBe(url);
  });

  it('drops the stock image Deezer gives when there is no picture', () => {
    expect(deezerImage('https://cdn-images.dzcdn.net/images/artist//1000x1000-000000-80-0-0.jpg')).toBeNull();
    expect(deezerImage('https://cdn-images.dzcdn.net/images/cover//500x500-000000-80-0-0.jpg')).toBeNull();
    expect(deezerImage(null)).toBeNull();
  });
});

describe('lrclib client', () => {
  const lyrics = { id: 9, trackName: 'Dracula', artistName: 'Tame Impala', duration: 210, instrumental: false, plainLyrics: 'a', syncedLyrics: '[00:01.00] a' };

  it('falls back to search when the exact lookup is not found', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(json({ name: 'TrackNotFound' }, 404))
      .mockResolvedValueOnce(json([{ ...lyrics, duration: 400 }, lyrics]));
    const lrclib = createLrclibClient({ userAgent: 'test', fetch });
    await expect(lrclib.find({ title: 'Dracula', artist: 'Tame Impala', durationSec: 209 })).resolves.toMatchObject({ duration: 210 });
  });

  it('returns null when nothing matches', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(json({}, 404)).mockResolvedValueOnce(json([]));
    const lrclib = createLrclibClient({ userAgent: 'test', fetch });
    await expect(lrclib.find({ title: 'x', artist: 'y' })).resolves.toBeNull();
  });
});

describe('appleArtwork', () => {
  it('asks the CDN for a larger image', () => {
    expect(appleArtwork('https://is1-ssl.mzstatic.com/image/thumb/a.jpg/100x100bb.jpg')).toBe('https://is1-ssl.mzstatic.com/image/thumb/a.jpg/600x600bb.jpg');
    expect(appleArtwork(undefined)).toBeNull();
  });
});

describe('youtube client', () => {
  const video = (id: string, title: string) => ({
    id: { videoId: id },
    snippet: { title, channelTitle: 'Artist &amp; Band', thumbnails: { high: { url: `https://i.ytimg.com/${id}.jpg` } } },
  });

  it('adds durations from a second request and decodes HTML entities', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(json({ items: [video('a', 'Rock &amp; Roll'), video('b', 'Other')] }))
      .mockResolvedValueOnce(json({ items: [{ id: 'a', contentDetails: { duration: 'PT3M25S' } }] }));
    const youtube = createYoutubeClient({ userAgent: 'test', apiKey: 'key', fetch });

    await expect(youtube.searchVideos('rock', 2)).resolves.toEqual([
      { videoId: 'a', title: 'Rock & Roll', channel: 'Artist & Band', duration: 'PT3M25S', thumbnailUrl: 'https://i.ytimg.com/a.jpg' },
      { videoId: 'b', title: 'Other', channel: 'Artist & Band', duration: null, thumbnailUrl: 'https://i.ytimg.com/b.jpg' },
    ]);
    expect(fetch).toHaveBeenLastCalledWith(expect.stringContaining('/videos?part=contentDetails&id=a%2Cb'), expect.anything());
  });

  it('skips the second request when there are no results', async () => {
    const fetch = vi.fn(async () => json({ items: [] }));
    const youtube = createYoutubeClient({ userAgent: 'test', apiKey: 'key', fetch });
    await expect(youtube.searchVideos('nothing', 5)).resolves.toEqual([]);
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('keeps the API key out of errors', async () => {
    const youtube = createYoutubeClient({ userAgent: 'test', apiKey: 'secret-key', retries: 0, fetch: async () => json({}, 403) });
    const error = await youtube.searchVideos('x', 1).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(HttpError);
    expect(String((error as HttpError).message)).not.toContain('secret-key');
    expect((error as HttpError).url).not.toContain('secret-key');
  });
});
