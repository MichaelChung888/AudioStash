import { describe, expect, it } from 'vitest';
import { readBearerToken, tokensMatch } from './tokens.ts';

describe('tokensMatch', () => {
  it('matches only the same token, whatever the lengths', () => {
    expect(tokensMatch('secret', 'secret')).toBe(true);
    expect(tokensMatch('secret', 'secreT')).toBe(false);
    expect(tokensMatch('s', 'a much longer secret')).toBe(false);
  });
});

describe('readBearerToken', () => {
  it('reads the token from an Authorization header', () => {
    expect(readBearerToken('Bearer abc')).toBe('abc');
    expect(readBearerToken('bearer   abc')).toBe('abc');
  });

  it('returns null for anything else', () => {
    expect(readBearerToken(undefined)).toBeNull();
    expect(readBearerToken('Basic abc')).toBeNull();
    expect(readBearerToken('Bearer')).toBeNull();
    expect(readBearerToken('Bearer a b')).toBeNull();
  });
});
