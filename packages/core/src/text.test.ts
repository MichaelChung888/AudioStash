import { describe, expect, it } from 'vitest';
import { normalizeForMatch, parseVideoTitle, similarity, stripFeaturing } from './text.ts';

describe('normalizeForMatch', () => {
  it('removes accents, punctuation and case', () => {
    expect(normalizeForMatch('Beyoncé - Halo!')).toBe('beyonce halo');
    expect(normalizeForMatch('Simon & Garfunkel')).toBe('simon and garfunkel');
  });
});

describe('similarity', () => {
  it('is 1 for the same words in any order and 0 for no shared words', () => {
    expect(similarity('Blinding Lights', 'lights blinding')).toBe(1);
    expect(similarity('Blinding Lights', 'Houdini')).toBe(0);
  });
});

describe('parseVideoTitle', () => {
  it.each([
    ['Dua Lipa - Houdini (Official Music Video)', null, { artist: 'Dua Lipa', title: 'Houdini' }],
    ['The Weeknd – Blinding Lights [Official Audio] [4K]', null, { artist: 'The Weeknd', title: 'Blinding Lights' }],
    ['Houdini', 'Dua Lipa - Topic', { artist: 'Dua Lipa', title: 'Houdini' }],
    ['Levitating (Lyrics)', 'DuaLipaVEVO', { artist: 'DuaLipa', title: 'Levitating' }],
    ['Artist - Song - Live at Wembley', null, { artist: 'Artist', title: 'Song - Live at Wembley' }],
  ])('parses %s', (title, channel, expected) => {
    expect(parseVideoTitle(title, channel)).toEqual(expected);
  });
});

describe('stripFeaturing', () => {
  it.each([
    ['Dua Lipa ft. DaBaby', 'Dua Lipa'],
    ['Calvin Harris feat. Rihanna', 'Calvin Harris'],
    ['Drake (featuring Rihanna)', 'Drake'],
    ['Earth, Wind & Fire', 'Earth, Wind & Fire'],
  ])('%s -> %s', (input, expected) => {
    expect(stripFeaturing(input)).toBe(expected);
  });
});
