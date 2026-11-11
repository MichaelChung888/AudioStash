import { createClerkClient, type Session, verifyToken } from '@clerk/backend';
import { isClerkAPIResponseError, TokenVerificationError, TokenVerificationErrorReason } from '@clerk/backend/errors';
import { UnavailableError } from '../lib/errors.ts';

export interface SignedInUser {
  userId: string;
  sessionId: string;
}

export type ClerkSession = Pick<Session, 'id' | 'userId' | 'createdAt' | 'lastActiveAt' | 'latestActivity'>;

// The parts of Clerk the API uses. Tests replace it with a fake.
export interface Clerk {
  // Null when the token is not one Clerk issued for this app, or has expired.
  verifySessionToken(token: string): Promise<SignedInUser | null>;
  listActiveSessions(userId: string): Promise<ClerkSession[]>;
  getSession(sessionId: string): Promise<ClerkSession | null>;
  revokeSession(sessionId: string): Promise<void>;
}

export function createClerk({ secretKey, jwtKey }: { secretKey: string; jwtKey?: string | undefined }): Clerk {
  const client = createClerkClient({ secretKey });

  return {
    async verifySessionToken(token) {
      try {
        const claims = await verifyToken(token, { secretKey, jwtKey });
        // Every session token has a sid. A token without one was made for something else.
        if (typeof claims.sid !== 'string') return null;
        return { userId: claims.sub, sessionId: claims.sid };
      } catch (error) {
        if (!(error instanceof TokenVerificationError)) throw error;
        if (error.reason === TokenVerificationErrorReason.RemoteJWKFailedToLoad) throw new UnavailableError('Could not reach Clerk to check the token');
        // A wrong CLERK_SECRET_KEY is a server problem, not a bad token.
        if (error.reason === TokenVerificationErrorReason.InvalidSecretKey) throw error;
        return null;
      }
    },

    async listActiveSessions(userId) {
      const { data } = await client.sessions.getSessionList({ userId, status: 'active', limit: 100 });
      return data;
    },

    async getSession(sessionId) {
      try {
        return await client.sessions.getSession(sessionId);
      } catch (error) {
        if (isClerkAPIResponseError(error) && error.status === 404) return null;
        throw error;
      }
    },

    async revokeSession(sessionId) {
      await client.sessions.revokeSession(sessionId);
    },
  };
}
