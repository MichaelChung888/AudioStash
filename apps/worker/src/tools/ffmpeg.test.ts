import { describe, expect, it } from 'vitest';
import { parseLoudness, parseProbe } from './ffmpeg.ts';

describe('parseProbe', () => {
  it('reads an Opus file, where tags live on the stream', () => {
    const probe = parseProbe({
      streams: [{ codec_type: 'audio', codec_name: 'opus', tags: { TITLE: 'Houdini', ARTIST: 'Dua Lipa' } }],
      format: { duration: '185.32', bit_rate: '131000', tags: { encoder: 'Lavf' } },
    });
    expect(probe).toEqual({
      codec: 'opus',
      durationMs: 185_320,
      bitrateKbps: 131,
      hasPicture: false,
      tags: { title: 'Houdini', artist: 'Dua Lipa', encoder: 'Lavf' },
    });
  });

  it('reads an MP3 with cover art, where tags live on the container', () => {
    const probe = parseProbe({
      streams: [
        { codec_type: 'audio', codec_name: 'mp3', bit_rate: '320000' },
        { codec_type: 'video', codec_name: 'mjpeg', disposition: { attached_pic: 1 } },
      ],
      format: { duration: '200', tags: { Title: 'Song', album_artist: 'Band' } },
    });
    expect(probe).toMatchObject({ codec: 'mp3', bitrateKbps: 320, hasPicture: true, tags: { title: 'Song', album_artist: 'Band' } });
  });

  it('does not count a video track as a cover', () => {
    const probe = parseProbe({
      streams: [
        { codec_type: 'video', codec_name: 'h264', disposition: { attached_pic: 0 } },
        { codec_type: 'audio', codec_name: 'aac' },
      ],
      format: {},
    });
    expect(probe).toMatchObject({ codec: 'aac', durationMs: 0, bitrateKbps: null, hasPicture: false });
  });

  it('rejects a file with no audio', () => {
    expect(() => parseProbe({ streams: [{ codec_type: 'video', codec_name: 'h264' }], format: {} })).toThrow('no audio stream');
  });
});

describe('parseLoudness', () => {
  const summary = (value: string) => `[Parsed_ebur128_0 @ 0x1] Summary:\n\n  Integrated loudness:\n    I:         ${value} LUFS\n    Threshold: -19.3 LUFS\n`;

  it('reads the integrated loudness from the summary', () => {
    expect(parseLoudness(summary('-9.3'))).toBe(-9.3);
    expect(parseLoudness(summary('-14.0'))).toBe(-14);
  });

  it('returns null for silence or a missing summary', () => {
    expect(parseLoudness(summary('-inf'))).toBeNull();
    expect(parseLoudness('no summary here')).toBeNull();
  });
});
