// The play order is a list of indices into the songs the person chose to play.
// With shuffle on, `first` plays first and the rest follow in random order.
export function playOrder(length: number, first: number, shuffle: boolean, random: () => number = Math.random): number[] {
  const order = Array.from({ length }, (_, i) => i);
  if (!shuffle) return order;
  const rest = order.filter((i) => i !== first);
  // Fisher–Yates: every order is equally likely.
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [rest[i], rest[j]] = [rest[j] as number, rest[i] as number];
  }
  return [first, ...rest];
}

// The order the songs play in, and the position in that order to start from.
// `first` is the index of the song that was tapped. For song 4 of 5 (index 3):
//
//   shuffle off: { order: [0, 1, 2, 3, 4], position: 3 }  the list as it is; start at the tapped song
//   shuffle on:  { order: [3, 0, 4, 2, 1], position: 0 }  the tapped song first, the rest random
export function startQueue(length: number, first: number, shuffle: boolean, random: () => number = Math.random): { order: number[]; position: number } {
  const order = playOrder(length, first, shuffle, random);
  return { order, position: Math.max(0, order.indexOf(first)) };
}

// Keeps the songs that pass `keep`, and renumbers the play order to match the shorter list.
// For songs [a, b, c, d] played in order [2, 0, 3, 1] (c, a, d, b), dropping b:
//
//   { songs: [a, c, d], order: [1, 0, 2] }  still c, a, d
export function keepSongs<T>(songs: readonly T[], order: readonly number[], keep: (song: T) => boolean): { songs: T[]; order: number[] } {
  const kept: T[] = [];
  const newIndex = new Map<number, number>();
  for (const [index, song] of songs.entries()) {
    if (!keep(song)) continue;
    newIndex.set(index, kept.length);
    kept.push(song);
  }
  return { songs: kept, order: order.filter((index) => newIndex.has(index)).map((index) => newIndex.get(index) as number) };
}

export type RepeatMode = 'none' | 'all' | 'single';

export function nextRepeatMode(mode: RepeatMode): RepeatMode {
  if (mode === 'none') return 'all';
  if (mode === 'all') return 'single';
  return 'none';
}

// A play counts once the song has played for 30 seconds, or half of it if shorter,
// so skipping through songs does not count them.
export function playCountsAt(durationSec: number): number {
  return Math.min(30, durationSec / 2);
}
