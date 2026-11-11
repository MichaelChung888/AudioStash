// File and folder names must be valid on Android shared storage and on FAT/exFAT
// SD cards, which reject the same characters as Windows.
const FORBIDDEN_CHARS = /[<>:"/\\|?*\p{Cc}]/gu;
const RESERVED_NAMES = /^(con|prn|aux|nul|com\d|lpt\d)(\..*)?$/i;
// Most filesystems cap a name at 255 bytes. Leave room for " (2)" and the extension.
const MAX_SEGMENT_BYTES = 120;

export const SONGS_DIR = 'Songs';
export const PLAYLISTS_DIR = 'Playlists';

export function sanitizeSegment(name: string, fallback = 'Unknown'): string {
  let segment = name
    .normalize('NFC')
    .replace(FORBIDDEN_CHARS, '_')
    .replace(/\s+/g, ' ')
    .trim()
    // A leading dot hides the file on Android and Linux.
    .replace(/^\.+/, '')
    // Windows silently drops trailing dots and spaces, which breaks lookups.
    .replace(/[. ]+$/, '');

  segment = truncateUtf8(segment, MAX_SEGMENT_BYTES).replace(/[. ]+$/, '');
  if (!segment) return fallback;
  return RESERVED_NAMES.test(segment) ? `_${segment}` : segment;
}

export function buildSongPath(input: { artist: string; title: string; extension: string }): string {
  return `${SONGS_DIR}/${sanitizeSegment(input.artist, 'Unknown Artist')}/${sanitizeSegment(input.title, 'Untitled')}.${input.extension}`;
}

// "Songs/A/Title.opus" with n=2 -> "Songs/A/Title (2).opus". Used when two songs share artist and title.
export function withPathSuffix(path: string, n: number): string {
  const dot = path.lastIndexOf('.');
  const slash = path.lastIndexOf('/');
  if (dot <= slash) return `${path} (${n})`;
  return `${path.slice(0, dot)} (${n})${path.slice(dot)}`;
}

export function buildPlaylistPath(name: string): string {
  return `${PLAYLISTS_DIR}/${sanitizeSegment(name, 'Playlist')}.m3u8`;
}

function truncateUtf8(text: string, maxBytes: number): string {
  const encoder = new TextEncoder();
  if (encoder.encode(text).length <= maxBytes) return text;
  let bytes = 0;
  let result = '';
  // Iterating a string yields whole code points, so emoji and accented letters are never cut in half.
  for (const char of text) {
    bytes += encoder.encode(char).length;
    if (bytes > maxBytes) break;
    result += char;
  }
  return result;
}
