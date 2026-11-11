import type { Session } from '@pluck/contracts';
import { ForbiddenError, NotFoundError, UnauthorizedError } from '../lib/errors.ts';
import { tokensMatch } from '../lib/tokens.ts';
import type { Clerk, ClerkSession, SignedInUser } from './clerk.ts';

interface Deps {
  clerk: Clerk;
  allowedUserIds: readonly string[];
  workerToken: string;
}

// A session token is accepted until it expires, about a minute after Clerk issued
// it, even if its session was revoked in that time. Revoked sessions are remembered
// for longer than that, so this API refuses their tokens at once.
const REMEMBER_REVOKED_MS = 5 * 60_000;

export function createAuthService({ clerk, allowedUserIds, workerToken }: Deps) {
  const allowed = new Set(allowedUserIds);
  const revokedUntil = new Map<string, number>();

  const isRevoked = (sessionId: string) => (revokedUntil.get(sessionId) ?? 0) > Date.now();

  function rememberRevoked(sessionId: string) {
    const now = Date.now();
    for (const [id, until] of revokedUntil) if (until <= now) revokedUntil.delete(id);
    revokedUntil.set(sessionId, now + REMEMBER_REVOKED_MS);
  }

  return {
    async authenticateUser(token: string | null): Promise<SignedInUser> {
      if (!token) throw new UnauthorizedError();
      const user = await clerk.verifySessionToken(token);
      if (!user || isRevoked(user.sessionId)) throw new UnauthorizedError();
      // Sign-ups are turned off in Clerk, but this check does not depend on that setting.
      if (!allowed.has(user.userId)) throw new ForbiddenError('This account is not allowed to use this server');
      return user;
    },

    authenticateWorker(token: string | null): void {
      if (!token || !tokensMatch(token, workerToken)) throw new UnauthorizedError();
    },

    async listSessions(user: SignedInUser): Promise<Session[]> {
      return (await clerk.listActiveSessions(user.userId)).map((session) => toSession(session, user.sessionId));
    },

    // Signs a device out. Its app finds out the next time it asks Clerk for a token.
    async revokeSession(user: SignedInUser, sessionId: string): Promise<void> {
      const session = await clerk.getSession(sessionId);
      if (!session || session.userId !== user.userId) throw new NotFoundError('Session not found');
      await clerk.revokeSession(sessionId);
      rememberRevoked(sessionId);
    },
  };
}

export type AuthService = ReturnType<typeof createAuthService>;

function toSession(session: ClerkSession, currentSessionId: string): Session {
  const activity = session.latestActivity;
  const join = (...parts: (string | undefined)[]) => parts.filter(Boolean).join(' · ') || null;
  return {
    id: session.id,
    device: join(activity?.deviceType, activity?.browserName),
    location: join(activity?.city, activity?.country),
    createdAt: new Date(session.createdAt).toISOString(),
    lastActiveAt: new Date(session.lastActiveAt).toISOString(),
    current: session.id === currentSessionId,
  };
}
