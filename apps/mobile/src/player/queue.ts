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
