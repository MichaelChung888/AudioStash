import type { Context } from 'hono';
import type { AppEnv } from '../lib/types.ts';

export async function listSessions(c: Context<AppEnv>) {
  return c.json({ sessions: await c.get('services').auth.listSessions(c.get('user')) });
}

export async function revokeSession(c: Context<AppEnv>, id: string) {
  const { auth, sse } = c.get('services');
  await auth.revokeSession(c.get('user'), id);
  sse.closeSession(id);
  c.get('log').info({ sessionId: id, by: c.get('user').sessionId }, 'session revoked');
  return c.body(null, 204);
}
