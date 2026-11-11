import { generateKeyBetween, generateNKeysBetween } from 'fractional-indexing';

// Playlist order uses fractional index keys: strings that sort in order, where a
// new key can always be made between any two others. Moving a song rewrites one
// row instead of renumbering the whole playlist, and two offline phones can both
// insert songs without clashing.
//
// Keys must be compared byte by byte (JavaScript `<`, Postgres COLLATE "C"), never
// with a locale-aware comparison, which orders upper and lower case differently.

export function positionBetween(before: string | null, after: string | null): string {
  return generateKeyBetween(before, after);
}

export function positionsAfter(last: string | null, count: number): string[] {
  return generateNKeysBetween(last, null, count);
}

export function comparePositions(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}
