import { generateKeyPairSync, type KeyObject, sign } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createClerk } from './clerk.ts';

// Clerk signs session tokens with RS256 and a 2048-bit key. A key pair made here
// stands in for the Clerk instance, so these tests check real tokens without a network.
const instanceKey = generateKeyPairSync('rsa', { modulusLength: 2048 });
const otherKey = generateKeyPairSync('rsa', { modulusLength: 2048 });

// CLERK_JWT_KEY is pasted into .env on one line.
const jwtKey = (instanceKey.publicKey.export({ type: 'spki', format: 'pem' }) as string).replaceAll('\n', '');
const clerk = createClerk({ secretKey: 'sk_test_unused', jwtKey });

const now = () => Math.floor(Date.now() / 1000);

function signToken(claims: Record<string, unknown>, key: KeyObject = instanceKey.privateKey): string {
  const encode = (part: object) => Buffer.from(JSON.stringify(part)).toString('base64url');
  const unsigned = `${encode({ alg: 'RS256', typ: 'JWT', kid: 'ins_test' })}.${encode(claims)}`;
  return `${unsigned}.${sign('sha256', Buffer.from(unsigned), key).toString('base64url')}`;
}

const sessionClaims = () => ({ sub: 'user_owner', sid: 'sess_phone', iss: 'https://test.clerk.accounts.dev', iat: now(), nbf: now() - 5, exp: now() + 60 });

describe('verifySessionToken', () => {
  it('reads the user and session from a valid token', async () => {
    await expect(clerk.verifySessionToken(signToken(sessionClaims()))).resolves.toEqual({ userId: 'user_owner', sessionId: 'sess_phone' });
  });

  it('rejects an expired token', async () => {
    const token = signToken({ ...sessionClaims(), iat: now() - 120, nbf: now() - 120, exp: now() - 60 });
    await expect(clerk.verifySessionToken(token)).resolves.toBeNull();
  });

  it('rejects a token signed with another key', async () => {
    await expect(clerk.verifySessionToken(signToken(sessionClaims(), otherKey.privateKey))).resolves.toBeNull();
  });

  it('rejects a token whose claims were changed after signing', async () => {
    const [header, , signature] = signToken(sessionClaims()).split('.');
    const forged = Buffer.from(JSON.stringify({ ...sessionClaims(), sub: 'user_attacker' })).toString('base64url');
    await expect(clerk.verifySessionToken(`${header}.${forged}.${signature}`)).resolves.toBeNull();
  });

  it('rejects a signed token that is not a session token', async () => {
    const { sid: _, ...claims } = sessionClaims();
    await expect(clerk.verifySessionToken(signToken(claims))).resolves.toBeNull();
  });

  it('rejects text that is not a token', async () => {
    await expect(clerk.verifySessionToken('not-a-jwt')).resolves.toBeNull();
  });
});
