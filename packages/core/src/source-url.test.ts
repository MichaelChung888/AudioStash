import { describe, expect, it } from 'vitest';
import { parseSourceUrl } from './source-url.ts';

describe('parseSourceUrl', () => {
  it.each([
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://youtu.be/dQw4w9WgXcQ?si=abc', 'dQw4w9WgXcQ'],
    ['https://music.youtube.com/watch?v=dQw4w9WgXcQ&feature=share', 'dQw4w9WgXcQ'],
    ['https://m.youtube.com/shorts/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=RDdQw4w9WgXcQ&start_radio=1', 'dQw4w9WgXcQ'],
  ])('reads %s as one YouTube video', (url, id) => {
    expect(parseSourceUrl(url)).toEqual({ source: 'youtube', kind: 'track', sourceId: id, url: `https://www.youtube.com/watch?v=${id}` });
  });

  it('reads a YouTube playlist link as a collection with a canonical URL', () => {
    expect(parseSourceUrl('https://music.youtube.com/playlist?list=PL123abc&si=x')).toEqual({
      source: 'youtube',
      kind: 'collection',
      sourceId: null,
      url: 'https://www.youtube.com/playlist?list=PL123abc',
    });
  });

  it('tells SoundCloud tracks from sets and profiles', () => {
    expect(parseSourceUrl('https://soundcloud.com/artist/a-song')?.kind).toBe('track');
    expect(parseSourceUrl('https://soundcloud.com/artist/sets/an-album')?.kind).toBe('collection');
    expect(parseSourceUrl('https://soundcloud.com/artist')?.kind).toBe('collection');
  });

  it('tells Bandcamp tracks from albums', () => {
    expect(parseSourceUrl('https://artist.bandcamp.com/track/song')).toMatchObject({ source: 'bandcamp', kind: 'track' });
    expect(parseSourceUrl('https://artist.bandcamp.com/album/record')).toMatchObject({ source: 'bandcamp', kind: 'collection' });
  });

  it('accepts other sites as unknown so the downloader can try them', () => {
    expect(parseSourceUrl('https://vimeo.com/12345')).toMatchObject({ source: 'other', kind: 'unknown' });
  });

  it.each(['not a url', 'ftp://youtube.com/watch?v=dQw4w9WgXcQ', 'https://www.youtube.com/watch?v=short', 'https://youtu.be/'])('rejects %s', (url) => {
    expect(parseSourceUrl(url)).toBeNull();
  });
});
