import { describe, expect, it } from 'vitest';
import type { VideoInfo } from '../tools/ytdlp.ts';
import { normalizeIsrc, trackFromTags } from './find-source.ts';
import { bestThumbnail, sourceFromInfo, trackFromInfo } from './source.ts';

const video = (overrides: Partial<VideoInfo> = {}): VideoInfo => ({
  id: 'aaaaaaaaaaa',
  title: 'Dua Lipa - Houdini (Official Music Video)',
  webpage_url: 'https://www.youtube.com/watch?v=aaaaaaaaaaa',
  extractor_key: 'Youtube',
  channel: 'Dua Lipa',
  ...overrides,
});

describe('sourceFromInfo', () => {
  it('uses the video id for YouTube, with a canonical link', () => {
    expect(sourceFromInfo(video({ webpage_url: 'https://music.youtube.com/watch?v=aaaaaaaaaaa' }))).toEqual({
      source: 'youtube',
      sourceId: 'aaaaaaaaaaa',
      sourceUrl: 'https://www.youtube.com/watch?v=aaaaaaaaaaa',
    });
  });

  it('uses the track id for SoundCloud and Bandcamp', () => {
    expect(sourceFromInfo(video({ id: '123', extractor_key: 'Soundcloud', webpage_url: 'https://soundcloud.com/a/b' }))).toEqual({
      source: 'soundcloud',
      sourceId: '123',
      sourceUrl: 'https://soundcloud.com/a/b',
    });
    expect(sourceFromInfo(video({ id: '456', extractor_key: 'Bandcamp' }))).toMatchObject({ source: 'bandcamp', sourceId: '456' });
  });

  it('prefixes other sites with the site name, since ids are only unique per site', () => {
    expect(sourceFromInfo(video({ id: '789', extractor_key: 'Vimeo' }))).toMatchObject({ source: 'other', sourceId: 'vimeo:789' });
  });
});

describe('trackFromInfo', () => {
  it('prefers the track and artist fields when the site provides them', () => {
    expect(trackFromInfo(video({ track: 'Houdini', artists: ['Dua Lipa'], album: 'Radical Optimism', release_year: 2024 }))).toEqual({
      title: 'Houdini',
      artist: 'Dua Lipa',
      album: 'Radical Optimism',
      year: 2024,
    });
  });

  it('parses the video title otherwise', () => {
    expect(trackFromInfo(video())).toEqual({ title: 'Houdini', artist: 'Dua Lipa', album: null, year: null });
  });

  it('falls back to the channel name for the artist', () => {
    expect(trackFromInfo(video({ title: 'Houdini', channel: 'Dua Lipa - Topic' }))).toMatchObject({ title: 'Houdini', artist: 'Dua Lipa' });
  });
});

describe('bestThumbnail', () => {
  it('picks the largest thumbnail', () => {
    const info = video({
      thumbnail: 'https://i.ytimg.com/default.jpg',
      thumbnails: [
        { url: 'https://i.ytimg.com/small.jpg', width: 120, height: 90 },
        { url: 'https://i.ytimg.com/max.jpg', width: 1280, height: 720 },
        { url: 'https://i.ytimg.com/unknown.jpg' },
      ],
    });
    expect(bestThumbnail(info)).toBe('https://i.ytimg.com/max.jpg');
  });

  it('falls back to the main thumbnail, then null', () => {
    expect(bestThumbnail(video({ thumbnail: 'https://i.ytimg.com/default.jpg' }))).toBe('https://i.ytimg.com/default.jpg');
    expect(bestThumbnail(video())).toBeNull();
  });
});

describe('trackFromTags', () => {
  it('reads the file tags', () => {
    expect(trackFromTags({ title: 'Song', artist: 'Band', album: 'Album', date: '2019-05-03' }, 'whatever.mp3')).toEqual({
      title: 'Song',
      artist: 'Band',
      album: 'Album',
      year: 2019,
    });
  });

  it('parses "Artist - Title" from the file name when there are no tags', () => {
    expect(trackFromTags({}, 'Band - Song.mp3')).toEqual({ title: 'Song', artist: 'Band', album: null, year: null });
    expect(trackFromTags({}, 'voice memo.m4a')).toEqual({ title: 'voice memo', artist: null, album: null, year: null });
  });
});

describe('normalizeIsrc', () => {
  it('accepts ISRCs with or without dashes', () => {
    expect(normalizeIsrc('gb-ahs-23-00001')).toBe('GBAHS2300001');
    expect(normalizeIsrc('GBAHS2300001')).toBe('GBAHS2300001');
  });

  it('rejects anything else', () => {
    expect(normalizeIsrc('not an isrc')).toBeNull();
    expect(normalizeIsrc(undefined)).toBeNull();
  });
});
