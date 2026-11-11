import { describe, expect, it } from 'vitest';
import { planEncode } from './format.ts';

describe('planEncode', () => {
  it('copies a stream the app can store, keeping its codec', () => {
    expect(planEncode('opus', 'best')).toEqual({ codec: 'opus', extension: 'opus', args: ['-c:a', 'copy'], reencode: false });
    expect(planEncode('aac', 'best')).toMatchObject({ codec: 'aac', extension: 'm4a', reencode: false });
    expect(planEncode('mp3', 'best')).toMatchObject({ codec: 'mp3', reencode: false });
  });

  it('encodes other codecs to Opus for the best format', () => {
    expect(planEncode('vorbis', 'best')).toMatchObject({ codec: 'opus', reencode: true, args: ['-c:a', 'libopus', '-b:a', '192k'] });
    expect(planEncode('flac', 'best')).toMatchObject({ codec: 'opus', reencode: true });
  });

  it('converts only when the chosen format needs it', () => {
    expect(planEncode('opus', 'm4a')).toMatchObject({ codec: 'aac', extension: 'm4a', reencode: true });
    expect(planEncode('aac', 'm4a')).toMatchObject({ codec: 'aac', reencode: false });
    expect(planEncode('opus', 'mp3')).toMatchObject({ codec: 'mp3', args: ['-c:a', 'libmp3lame', '-q:a', '0'] });
    expect(planEncode('mp3', 'mp3')).toMatchObject({ reencode: false });
  });
});
