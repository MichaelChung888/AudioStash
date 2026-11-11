import { PLAYLISTS_DIR } from './paths.ts';

export interface M3uEntry {
  // Relative to the library root, e.g. "Songs/Dua Lipa/Houdini.opus".
  path: string;
  durationSec: number;
  artist: string;
  title: string;
}

// Builds an extended M3U playlist (UTF-8, hence .m3u8). The file lives in
// "Playlists/", so song paths are written relative to it ("../Songs/...").
// Any music player that reads the folder can then open the playlist.
export function buildM3u8(name: string, entries: readonly M3uEntry[]): string {
  const lines = ['#EXTM3U', `#PLAYLIST:${singleLine(name)}`];
  for (const entry of entries) {
    lines.push(`#EXTINF:${Math.round(entry.durationSec)},${singleLine(entry.artist)} - ${singleLine(entry.title)}`);
    lines.push(relativeToPlaylists(entry.path));
  }
  return `${lines.join('\n')}\n`;
}

function relativeToPlaylists(libraryPath: string): string {
  const depth = PLAYLISTS_DIR.split('/').length;
  return `${'../'.repeat(depth)}${libraryPath}`;
}

function singleLine(text: string): string {
  return text.replace(/[\r\n]+/g, ' ').trim();
}
