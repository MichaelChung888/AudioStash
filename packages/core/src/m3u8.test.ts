import { describe, expect, it } from 'vitest';
import { buildM3u8 } from './m3u8.ts';

describe('buildM3u8', () => {
  it('writes an extended M3U with paths relative to the Playlists folder', () => {
    const file = buildM3u8('Road trip', [{ path: 'Songs/Dua Lipa/Houdini.opus', durationSec: 185.4, artist: 'Dua Lipa', title: 'Houdini' }]);
    expect(file).toBe('#EXTM3U\n#PLAYLIST:Road trip\n#EXTINF:185,Dua Lipa - Houdini\n../Songs/Dua Lipa/Houdini.opus\n');
  });

  it('keeps each entry on one line', () => {
    const file = buildM3u8('A\nB', [{ path: 'Songs/X/Y.mp3', durationSec: 1, artist: 'X', title: 'Y\r\nZ' }]);
    expect(file).toContain('#PLAYLIST:A B\n');
    expect(file).toContain('X - Y Z\n');
  });
});
