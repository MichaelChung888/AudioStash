import { AUDIO_EXTENSIONS, type AudioCodec } from '@audiostash/contracts';
import { buildSongPath, stripFeaturing, withPathSuffix } from '@audiostash/core';
import type { Transaction } from '@audiostash/db';
import * as songsDb from '../db/songs.ts';

const VARIOUS_ARTISTS = /^various artists$/i;

// "Songs/<Artist>/<Title>.<ext>", with " (2)", " (3)" ... added when another song
// already has the path. The folder is the album artist when there is a real one,
// so an album's songs stay together, otherwise the main artist without "feat. X".
export async function chooseSongPath(
  tx: Transaction,
  song: { id: string; title: string; artist: string; albumArtist: string | null; codec: AudioCodec },
): Promise<string> {
  const folderArtist = song.albumArtist && !VARIOUS_ARTISTS.test(song.albumArtist) ? song.albumArtist : stripFeaturing(song.artist);
  const base = buildSongPath({ artist: folderArtist, title: song.title, extension: AUDIO_EXTENSIONS[song.codec] });
  await songsDb.lockPath(tx, base);
  for (let n = 1; ; n++) {
    const candidate = n === 1 ? base : withPathSuffix(base, n);
    if (!(await songsDb.isPathTaken(tx, candidate, song.id))) return candidate;
  }
}
