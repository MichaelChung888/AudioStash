export interface LyricLine {
  timeMs: number;
  text: string;
}

const TIMESTAMP = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;
const OFFSET = /^\[offset:\s*([+-]?\d+)\s*\]/im;

// Parses LRC synced lyrics ("[00:28.88] The morning light...") into lines sorted by time.
// A line may carry several timestamps when it repeats, e.g. a chorus:
// "[00:45.00][01:30.00] chorus line".
export function parseLrc(lrc: string): LyricLine[] {
  // A positive offset means the lyrics should appear earlier.
  const offsetMs = Number(lrc.match(OFFSET)?.[1] ?? 0);
  const lines: LyricLine[] = [];

  for (const raw of lrc.split(/\r?\n/)) {
    const stamps = [...raw.matchAll(TIMESTAMP)];
    if (stamps.length === 0) continue;
    const text = raw.replace(TIMESTAMP, '').trim();
    for (const [, min, sec, frac] of stamps) {
      const fractionMs = frac ? Number(frac.padEnd(3, '0')) : 0;
      const timeMs = Number(min) * 60_000 + Number(sec) * 1000 + fractionMs - offsetMs;
      lines.push({ timeMs: Math.max(0, timeMs), text });
    }
  }

  return lines.sort((a, b) => a.timeMs - b.timeMs);
}

// Index of the line being sung at `positionMs`, or -1 before the first line.
// Binary search, because the player calls this several times a second.
export function findActiveLine(lines: readonly LyricLine[], positionMs: number): number {
  let low = 0;
  let high = lines.length - 1;
  let found = -1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    const line = lines[mid];
    if (line && line.timeMs <= positionMs) {
      found = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return found;
}

export function lrcToPlain(lrc: string): string {
  return parseLrc(lrc)
    .map((line) => line.text)
    .join('\n')
    .trim();
}
