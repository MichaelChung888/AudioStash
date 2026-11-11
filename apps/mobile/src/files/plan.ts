import { buildM3u8, buildPlaylistPath, type M3uEntry, withPathSuffix } from '@pluck/core';

export interface WantedSong {
  id: string;
  // Relative to the music folder, e.g. "Songs/Dua Lipa/Houdini.opus".
  path: string;
  sha256: string;
}

export interface SavedSong {
  songId: string;
  path: string;
  sha256: string;
}

export interface SongPlan<W extends WantedSong, S extends SavedSong> {
  // In the order given, so the newest songs arrive first. previous is the file this
  // replaces, when the audio changed or the song moved (its title or artist was edited).
  save: { song: W; previous: S | null }[];
  // Saved files whose song left the library.
  remove: S[];
}

export function planSongs<W extends WantedSong, S extends SavedSong>(wanted: readonly W[], saved: readonly S[]): SongPlan<W, S> {
  const savedById = new Map(saved.map((file) => [file.songId, file]));
  const wantedIds = new Set(wanted.map((song) => song.id));
  const save: SongPlan<W, S>['save'] = [];
  for (const song of wanted) {
    const file = savedById.get(song.id);
    if (file && file.sha256 === song.sha256 && file.path === song.path) continue;
    save.push({ song, previous: file ?? null });
  }
  return { save, remove: saved.filter((file) => !wantedIds.has(file.songId)) };
}

export interface WantedPlaylist {
  id: string;
  name: string;
  // Only songs saved on the phone, in playlist order.
  entries: M3uEntry[];
}

export interface SavedPlaylist {
  playlistId: string;
  path: string;
  content: string;
}

export interface PlaylistPlan {
  write: { playlistId: string; path: string; content: string; previousPath: string | null }[];
  remove: SavedPlaylist[];
}

export function planPlaylists(wanted: readonly WantedPlaylist[], saved: readonly SavedPlaylist[]): PlaylistPlan {
  const savedById = new Map(saved.map((file) => [file.playlistId, file]));
  const wantedIds = new Set(wanted.map((playlist) => playlist.id));
  const taken = new Set<string>();
  const write: PlaylistPlan['write'] = [];

  // Sorted by id so two playlists with the same name keep the same file names on every run.
  for (const playlist of [...wanted].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    let path = buildPlaylistPath(playlist.name);
    for (let n = 2; taken.has(path.toLowerCase()); n++) path = withPathSuffix(buildPlaylistPath(playlist.name), n);
    taken.add(path.toLowerCase());

    const content = buildM3u8(playlist.name, playlist.entries);
    const file = savedById.get(playlist.id);
    if (file && file.path === path && file.content === content) continue;
    write.push({ playlistId: playlist.id, path, content, previousPath: file && file.path !== path ? file.path : null });
  }

  return { write, remove: saved.filter((file) => !wantedIds.has(file.playlistId)) };
}

// "Songs/Dua Lipa/Houdini.opus" -> { folders: ["Songs", "Dua Lipa"], name: "Houdini.opus" }
export function splitPath(path: string): { folders: string[]; name: string } {
  const parts = path.split('/');
  const name = parts.pop() ?? '';
  return { folders: parts, name };
}
