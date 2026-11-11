import { describe, expect, it } from 'vitest';
import { planPlaylists, planSongs, splitPath } from './plan.ts';

describe('planSongs', () => {
  const song = { id: 's1', path: 'Songs/A/One.opus', sha256: 'aaa' };

  it('saves new songs and skips ones already saved', () => {
    const plan = planSongs([song, { id: 's2', path: 'Songs/B/Two.opus', sha256: 'bbb' }], [{ songId: 's1', path: song.path, sha256: 'aaa' }]);
    expect(plan.save.map((item) => item.song.id)).toEqual(['s2']);
    expect(plan.remove).toEqual([]);
  });

  it('saves again when the audio changed', () => {
    const previous = { songId: 's1', path: song.path, sha256: 'old' };
    expect(planSongs([song], [previous]).save).toEqual([{ song, previous }]);
  });

  it('saves again when a song moved', () => {
    const previous = { songId: 's1', path: 'Songs/A/Old title.opus', sha256: 'aaa' };
    expect(planSongs([song], [previous]).save).toEqual([{ song, previous }]);
  });

  it('marks new songs as replacing nothing', () => {
    expect(planSongs([song], []).save).toEqual([{ song, previous: null }]);
  });

  it('removes files for songs no longer in the library', () => {
    const gone = { songId: 's9', path: 'Songs/Z/Gone.opus', sha256: 'zzz' };
    expect(planSongs([], [gone]).remove).toEqual([gone]);
  });
});

describe('planPlaylists', () => {
  const entries = [{ path: 'Songs/A/One.opus', durationSec: 200, artist: 'A', title: 'One' }];

  it('writes a playlist file once, then only when its content changes', () => {
    const first = planPlaylists([{ id: 'p1', name: 'Gym', entries }], []);
    expect(first.write).toHaveLength(1);
    const written = first.write[0];
    if (!written) throw new Error('expected a write');
    expect(written.path).toBe('Playlists/Gym.m3u8');

    const saved = [{ playlistId: 'p1', path: written.path, content: written.content }];
    expect(planPlaylists([{ id: 'p1', name: 'Gym', entries }], saved).write).toEqual([]);
    expect(planPlaylists([{ id: 'p1', name: 'Gym', entries: [] }], saved).write).toHaveLength(1);
  });

  it('gives two playlists with the same name different files', () => {
    const plan = planPlaylists(
      [
        { id: 'p2', name: 'Mix', entries },
        { id: 'p1', name: 'Mix', entries },
      ],
      [],
    );
    expect(plan.write.map((item) => [item.playlistId, item.path])).toEqual([
      ['p1', 'Playlists/Mix.m3u8'],
      ['p2', 'Playlists/Mix (2).m3u8'],
    ]);
  });

  it('removes the old file after a rename and files of deleted playlists', () => {
    const saved = [
      { playlistId: 'p1', path: 'Playlists/Old.m3u8', content: '' },
      { playlistId: 'p2', path: 'Playlists/Gone.m3u8', content: '' },
    ];
    const plan = planPlaylists([{ id: 'p1', name: 'New', entries }], saved);
    expect(plan.write[0]?.previousPath).toBe('Playlists/Old.m3u8');
    expect(plan.remove.map((file) => file.playlistId)).toEqual(['p2']);
  });
});

describe('splitPath', () => {
  it('separates the folders from the file name', () => {
    expect(splitPath('Songs/Dua Lipa/Houdini.opus')).toEqual({ folders: ['Songs', 'Dua Lipa'], name: 'Houdini.opus' });
  });
});
