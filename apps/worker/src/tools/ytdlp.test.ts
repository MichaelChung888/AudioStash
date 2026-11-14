import { PermanentJobError } from '@audiostash/messaging';
import { describe, expect, it } from 'vitest';
import { ProcessError } from '../lib/process.ts';
import { classifyError, parseCollection, parseProgress, parseSearch } from './ytdlp.ts';

describe('parseProgress', () => {
  it('uses the total size, or the estimate when the total is unknown', () => {
    expect(parseProgress('audiostash-progress 500 1000 NA')).toBe(0.5);
    expect(parseProgress('audiostash-progress 250 NA 1000')).toBe(0.25);
  });

  it('returns null when no size is known', () => {
    expect(parseProgress('audiostash-progress 500 NA NA')).toBeNull();
    expect(parseProgress('audiostash-progress NA NA NA')).toBeNull();
  });

  it('never goes above 1', () => {
    expect(parseProgress('audiostash-progress 1200 NA 1000')).toBe(1);
  });
});

describe('parseCollection', () => {
  it('lists playlist entries, skipping unavailable videos and channel tabs', () => {
    const result = parseCollection({
      title: 'Road Trip',
      entries: [
        { ie_key: 'Youtube', id: 'aaaaaaaaaaa', url: 'aaaaaaaaaaa', title: 'Dua Lipa - Houdini (Official Music Video)', channel: 'Dua Lipa', duration: 185.4 },
        { ie_key: 'Youtube', id: 'bbbbbbbbbbb', title: '[Private video]' },
        null,
        { ie_key: 'YoutubeTab', url: 'https://www.youtube.com/@x/shorts', title: 'Shorts' },
        { ie_key: 'Soundcloud', url: 'https://soundcloud.com/artist/song', title: 'Song', uploader: 'Artist' },
      ],
    });
    expect(result).toEqual({
      title: 'Road Trip',
      entries: [
        { url: 'https://www.youtube.com/watch?v=aaaaaaaaaaa', title: 'Houdini', artist: 'Dua Lipa', durationSec: 185 },
        { url: 'https://soundcloud.com/artist/song', title: 'Song', artist: 'Artist', durationSec: null },
      ],
    });
  });

  it('treats a link to one video as a list of one', () => {
    const result = parseCollection({
      id: 'aaaaaaaaaaa',
      title: 'Houdini',
      webpage_url: 'https://www.youtube.com/watch?v=aaaaaaaaaaa',
      extractor_key: 'Youtube',
      channel: 'Dua Lipa - Topic',
      duration: 185,
    });
    expect(result.title).toBe('Houdini');
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]).toMatchObject({ title: 'Houdini', artist: 'Dua Lipa' });
  });
});

describe('parseSearch', () => {
  it('keeps results with an id and a title', () => {
    const results = parseSearch({
      entries: [{ id: 'aaaaaaaaaaa', title: 'Houdini', channel: 'Dua Lipa - Topic', duration: 186 }, { id: 'bbbbbbbbbbb' }],
    });
    expect(results).toEqual([{ id: 'aaaaaaaaaaa', title: 'Houdini', channel: 'Dua Lipa - Topic', durationSec: 186 }]);
  });
});

describe('classifyError', () => {
  const failure = (stderr: string) => new ProcessError('yt-dlp', 1, stderr);

  it('marks errors that a retry cannot fix as permanent, with the last ERROR line as the message', () => {
    const error = classifyError(failure('[youtube] x: Downloading webpage\nERROR: [youtube] x: Video unavailable'));
    expect(error).toBeInstanceOf(PermanentJobError);
    expect((error as Error).message).toBe('[youtube] x: Video unavailable');
  });

  it('leaves the bot check retryable', () => {
    const error = classifyError(failure("ERROR: [youtube] x: Sign in to confirm you're not a bot"));
    expect(error).not.toBeInstanceOf(PermanentJobError);
    expect(error).toBeInstanceOf(Error);
  });

  it('passes other errors through unchanged', () => {
    const original = new Error('spawn yt-dlp ENOENT');
    expect(classifyError(original)).toBe(original);
  });
});
