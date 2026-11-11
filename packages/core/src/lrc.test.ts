import { describe, expect, it } from 'vitest';
import { findActiveLine, lrcToPlain, parseLrc } from './lrc.ts';

const LRC = `[ar:Tame Impala]
[ti:Dracula]
[00:28.88] The morning light is turning blue
[00:33.04] The night is almost over
[00:45.00][01:30.5] Chorus line
[01:02.123]`;

describe('parseLrc', () => {
  it('reads timestamps, skips metadata tags and sorts repeated lines by time', () => {
    expect(parseLrc(LRC)).toEqual([
      { timeMs: 28_880, text: 'The morning light is turning blue' },
      { timeMs: 33_040, text: 'The night is almost over' },
      { timeMs: 45_000, text: 'Chorus line' },
      { timeMs: 62_123, text: '' },
      { timeMs: 90_500, text: 'Chorus line' },
    ]);
  });

  it('applies the offset tag', () => {
    expect(parseLrc('[offset:+500]\n[00:10.00] a')).toEqual([{ timeMs: 9_500, text: 'a' }]);
  });
});

describe('findActiveLine', () => {
  const lines = parseLrc(LRC);

  it('returns -1 before the first line', () => {
    expect(findActiveLine(lines, 1_000)).toBe(-1);
  });

  it('returns the last line that has started', () => {
    expect(findActiveLine(lines, 28_880)).toBe(0);
    expect(findActiveLine(lines, 40_000)).toBe(1);
    expect(findActiveLine(lines, 999_999)).toBe(4);
  });
});

describe('lrcToPlain', () => {
  it('drops timestamps', () => {
    expect(lrcToPlain('[00:01.00] one\n[00:02.00] two')).toBe('one\ntwo');
  });
});
