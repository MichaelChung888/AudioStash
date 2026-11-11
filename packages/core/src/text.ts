// Lowercase, strip accents and punctuation, so "Beyoncé - Halo!" and "beyonce halo" compare equal.
export function normalizeForMatch(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^\p{Letter}\p{Number}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokens(text: string): Set<string> {
  return new Set(normalizeForMatch(text).split(' ').filter(Boolean));
}

// Sørensen–Dice coefficient over word sets: 1 when the words are identical, 0 when none are shared.
export function similarity(a: string, b: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared++;
  return (2 * shared) / (ta.size + tb.size);
}

// Share of `needle`'s words found in `haystack`. Used when the haystack has extra words,
// like a video title that contains both the artist and the song title.
export function containment(needle: string, haystack: string): number {
  const tn = tokens(needle);
  const th = tokens(haystack);
  if (tn.size === 0) return 0;
  let found = 0;
  for (const t of tn) if (th.has(t)) found++;
  return found / tn.size;
}

const VIDEO_NOISE =
  /\s*[([]\s*(?:official\s*)?(?:music\s*)?(?:hd|hq|4k|8k|video|audio|lyrics?|lyric\s*video|visuali[sz]er|mv|m\/v|explicit|clean|out\s*now|free\s*download)(?:\s*(?:video|audio|version))?\s*[)\]]/gi;
const TITLE_SEPARATOR = /\s+[-–—]\s+/;
const CHANNEL_SUFFIX = /(?:\s*-\s*topic|vevo|\s*official)$/i;

export interface ParsedTitle {
  artist: string | null;
  title: string;
}

// Turns a video title such as "Dua Lipa - Houdini (Official Music Video) [4K]"
// into { artist: "Dua Lipa", title: "Houdini" }. Falls back to the channel name
// for the artist, minus suffixes like " - Topic" or "VEVO".
export function parseVideoTitle(videoTitle: string, channel?: string | null): ParsedTitle {
  const cleaned = videoTitle.replace(VIDEO_NOISE, '').replace(/\s+/g, ' ').trim();
  const parts = cleaned.split(TITLE_SEPARATOR);
  if (parts.length >= 2) {
    const [artist, ...rest] = parts;
    return { artist: artist?.trim() || null, title: rest.join(' - ').trim() };
  }
  const fromChannel = channel ? cleanChannelName(channel) : '';
  return { artist: fromChannel || null, title: cleaned };
}

// "Dua Lipa - Topic" and "DuaLipaVEVO" -> the artist's name, as far as it can be read.
export function cleanChannelName(channel: string): string {
  return channel.replace(CHANNEL_SUFFIX, '').trim();
}

const FEATURING = /\s+(?:feat\.?|ft\.?|featuring)\s+.*$/i;

// "Dua Lipa ft. DaBaby" -> "Dua Lipa". Only splits on featuring markers, never on
// "&" or ",", because many single artists use them ("Earth, Wind & Fire").
export function stripFeaturing(artist: string): string {
  return (
    artist
      .replace(/\s*[([]\s*(?:feat\.?|ft\.?|featuring)\s+[^)\]]*[)\]]/i, '')
      .replace(FEATURING, '')
      .trim() || artist.trim()
  );
}
