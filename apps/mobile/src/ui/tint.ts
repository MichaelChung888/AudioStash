// A quarter of the cover's colour over near-black. Any more, and the player's grey text gets hard to read on a pale cover.
const COVER_SHARE = 0.25;
const BASE = [11, 12, 14];

// The Now Playing background: the cover's main colour, darkened. Falls back when the song has no cover colour.
export function playerBackground(coverColor: string | null, fallback: string): string {
  const match = coverColor?.match(/^#([0-9a-f]{6})$/i);
  if (!match?.[1]) return fallback;
  const hex = match[1];
  const channels = [0, 2, 4].map((at, i) => {
    const cover = Number.parseInt(hex.slice(at, at + 2), 16);
    return Math.round(cover * COVER_SHARE + (BASE[i] as number) * (1 - COVER_SHARE));
  });
  return `#${channels.map((value) => value.toString(16).padStart(2, '0')).join('')}`;
}
