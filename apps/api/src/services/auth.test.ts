import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ForbiddenError, NotFoundError, UnauthorizedError } from '../lib/errors.ts';
import { FakeClerk, userToken } from '../testing/fakes.ts';
import { type AuthService, createAuthService } from './auth.ts';

const OWNER = 'user_owner';
const WORKER_TOKEN = 'w'.repeat(32);

let clerk: FakeClerk;
let auth: AuthService;

beforeEach(() => {
  clerk = new FakeClerk();
  auth = createAuthService({ clerk, allowedUserIds: [OWNER], workerToken: WORKER_TOKEN });
});

describe('authenticateUser', () => {
  it('returns the signed-in owner', async () => {
    const token = clerk.addSession(OWNER, 'sess_phone');
    await expect(auth.authenticateUser(token)).resolves.toEqual({ userId: OWNER, sessionId: 'sess_phone' });
  });

  it('rejects a missing token, or one Clerk did not issue', async () => {
    await expect(auth.authenticateUser(null)).rejects.toThrow(UnauthorizedError);
    await expect(auth.authenticateUser('forged')).rejects.toThrow(UnauthorizedError);
  });

  it('refuses a signed-in user who is not on the allowed list', async () => {
    const token = clerk.addSession('user_stranger', 'sess_x');
    await expect(auth.authenticateUser(token)).rejects.toThrow(ForbiddenError);
  });
});

describe('authenticateWorker', () => {
  it('accepts only WORKER_TOKEN', () => {
    expect(() => auth.authenticateWorker(WORKER_TOKEN)).not.toThrow();
    expect(() => auth.authenticateWorker('x'.repeat(32))).toThrow(UnauthorizedError);
    expect(() => auth.authenticateWorker(null)).toThrow(UnauthorizedError);
  });

  it('does not accept a user token', async () => {
    const token = clerk.addSession(OWNER, 'sess_phone');
    expect(() => auth.authenticateWorker(token)).toThrow(UnauthorizedError);
  });
});

describe('sessions', () => {
  const owner = { userId: OWNER, sessionId: 'sess_phone' };

  it('lists the owner’s sessions and marks the one making the request', async () => {
    clerk.addSession(OWNER, 'sess_phone', { id: 'act_1', isMobile: true, deviceType: 'Android', browserName: 'AudioStash', city: 'London', country: 'GB' });
    clerk.addSession(OWNER, 'sess_laptop');
    clerk.addSession('user_stranger', 'sess_x');

    const sessions = await auth.listSessions(owner);

    expect(sessions).toEqual([
      {
        id: 'sess_phone',
        device: 'Android · AudioStash',
        location: 'London · GB',
        createdAt: '1970-01-01T00:00:00.000Z',
        lastActiveAt: '1970-01-01T00:01:00.000Z',
        current: true,
      },
      expect.objectContaining({ id: 'sess_laptop', device: null, location: null, current: false }),
    ]);
  });

  it('refuses a revoked session’s token before the token expires', async () => {
    clerk.addSession(OWNER, 'sess_phone');
    const lostPhone = clerk.addSession(OWNER, 'sess_lost');

    await auth.revokeSession(owner, 'sess_lost');

    expect(clerk.sessions.has('sess_lost')).toBe(false);
    await expect(auth.authenticateUser(lostPhone)).rejects.toThrow(UnauthorizedError);
    await expect(auth.authenticateUser(userToken(OWNER, 'sess_phone'))).resolves.toEqual(owner);
  });

  it('cannot revoke another user’s session, or one that does not exist', async () => {
    clerk.addSession('user_stranger', 'sess_x');
    const revoke = vi.spyOn(clerk, 'revokeSession');

    await expect(auth.revokeSession(owner, 'sess_x')).rejects.toThrow(NotFoundError);
    await expect(auth.revokeSession(owner, 'sess_missing')).rejects.toThrow(NotFoundError);
    expect(revoke).not.toHaveBeenCalled();
  });
});
