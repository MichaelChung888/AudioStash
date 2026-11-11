import { createMiddleware } from 'hono/factory';
import { readBearerToken } from '../lib/tokens.ts';
import type { AppEnv } from '../lib/types.ts';

// The phone: a Clerk session token. It expires after about a minute, and the app's
// Clerk SDK fetches a new one before then.
export const requireUser = createMiddleware<AppEnv>(async (c, next) => {
  c.set('user', await c.get('services').auth.authenticateUser(readBearerToken(c.req.header('authorization'))));
  await next();
});

// The home worker: one shared secret, WORKER_TOKEN.
export const requireWorker = createMiddleware<AppEnv>(async (c, next) => {
  c.get('services').auth.authenticateWorker(readBearerToken(c.req.header('authorization')));
  await next();
});
