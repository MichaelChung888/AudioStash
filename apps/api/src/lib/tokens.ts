import { createHash, timingSafeEqual } from 'node:crypto';

const sha256 = (value: string) => createHash('sha256').update(value).digest();

// Comparing hashes keeps both inputs the same length, which timingSafeEqual requires,
// and the comparison time does not reveal how many characters matched.
export function tokensMatch(provided: string, expected: string): boolean {
  return timingSafeEqual(sha256(provided), sha256(expected));
}

export function readBearerToken(header: string | undefined): string | null {
  const match = header?.match(/^Bearer\s+(\S+)$/i);
  return match?.[1] ?? null;
}
