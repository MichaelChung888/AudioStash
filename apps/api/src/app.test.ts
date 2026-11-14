import type { ErrorBody } from '@audiostash/contracts';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from './app.ts';
import type { AppContext, Services } from './context.ts';
import { UnavailableError } from './lib/errors.ts';
import { createLogger } from './lib/logger.ts';
import { SseHub } from './realtime/sse-hub.ts';
import { createAuthService } from './services/auth.ts';
import { FakeClerk, userToken } from './testing/fakes.ts';

const OWNER = 'user_owner';
const USER_TOKEN = userToken(OWNER, 'sess_phone');
const WORKER_TOKEN = 'w'.repeat(32);
const ITEM_ID = '00000000-0000-4000-8000-000000000001';

// Only the services a test calls are filled in. Auth is the real service, with Clerk faked.
function setup(overrides: Partial<Services> = {}) {
  const clerk = new FakeClerk();
  clerk.addSession(OWNER, 'sess_phone');
  clerk.addSession(OWNER, 'sess_old');
  const services = {
    auth: createAuthService({ clerk, allowedUserIds: [OWNER], workerToken: WORKER_TOKEN }),
    sse: new SseHub(),
    catalog: { genres: async () => [{ id: 0, name: 'All' }] },
    ready: async () => ({ database: true, rabbitmq: true }),
    ...overrides,
  } as unknown as Services;
  const ctx: AppContext = { logger: createLogger({ level: 'silent', pretty: false }), services, start: async () => {}, close: async () => {} };
  const app = createApp(ctx);
  return (path: string, init: RequestInit & { token?: string } = {}) => {
    const headers = new Headers(init.headers);
    if (init.token) headers.set('authorization', `Bearer ${init.token}`);
    return app.request(path, { ...init, headers });
  };
}

describe('app', () => {
  it('answers health checks without a token', async () => {
    const res = await setup()('/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok' });
  });

  it('reports not ready when a dependency is down', async () => {
    const res = await setup({ ready: async () => ({ database: true, rabbitmq: false }) })('/ready');
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ status: 'unavailable', checks: { rabbitmq: false } });
  });

  it('returns a JSON 404 for unknown routes', async () => {
    const res = await setup()('/nope');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: { code: 'not_found', message: 'Route not found' } });
  });

  it('tags every response with a request id', async () => {
    const res = await setup()('/health');
    expect(res.headers.get('x-request-id')).toBeTruthy();
  });

  describe('auth', () => {
    it('rejects app routes without a token', async () => {
      const res = await setup()('/v1/catalog/genres');
      expect(res.status).toBe(401);
      expect(await res.json()).toMatchObject({ error: { code: 'unauthorized' } });
    });

    it('accepts the owner’s session token on app routes', async () => {
      const res = await setup()('/v1/catalog/genres', { token: USER_TOKEN });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ genres: [{ id: 0, name: 'All' }] });
    });

    it('refuses other Clerk users with 403', async () => {
      const res = await setup()('/v1/catalog/genres', { token: userToken('user_stranger', 'sess_x') });
      expect(res.status).toBe(403);
      expect(await res.json()).toMatchObject({ error: { code: 'forbidden' } });
    });

    it('does not accept a session token on worker routes', async () => {
      const res = await setup()(`/v1/worker/items/${ITEM_ID}/fail`, { method: 'POST', token: USER_TOKEN, body: '{}' });
      expect(res.status).toBe(401);
    });

    it('signs another device out, and its token stops working', async () => {
      const request = setup();
      const oldToken = userToken(OWNER, 'sess_old');
      expect((await request('/v1/catalog/genres', { token: oldToken })).status).toBe(200);

      const res = await request('/v1/sessions/sess_old', { method: 'DELETE', token: USER_TOKEN });

      expect(res.status).toBe(204);
      expect((await request('/v1/catalog/genres', { token: oldToken })).status).toBe(401);
      const { sessions } = (await (await request('/v1/sessions', { token: USER_TOKEN })).json()) as { sessions: { id: string; current: boolean }[] };
      expect(sessions).toEqual([expect.objectContaining({ id: 'sess_phone', current: true })]);
    });
  });

  describe('errors', () => {
    it('lists the invalid fields when validation fails', async () => {
      const res = await setup()('/v1/downloads', {
        method: 'POST',
        token: USER_TOKEN,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: 'not-a-uuid', source: { kind: 'url', url: 'https://youtu.be/dQw4w9WgXcQ' } }),
      });
      expect(res.status).toBe(400);
      const body = (await res.json()) as ErrorBody;
      expect(body.error.code).toBe('validation_failed');
      expect(body.error.details).toEqual(expect.arrayContaining([expect.objectContaining({ path: 'id' })]));
    });

    it('turns malformed JSON into a 400', async () => {
      const res = await setup()('/v1/downloads', { method: 'POST', token: USER_TOKEN, headers: { 'content-type': 'application/json' }, body: '{' });
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ error: { code: 'bad_request' } });
    });

    it('rejects bodies over the size limit', async () => {
      const res = await setup()('/v1/downloads', {
        method: 'POST',
        token: USER_TOKEN,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ padding: 'x'.repeat(1024 * 1024) }),
      });
      expect(res.status).toBe(413);
    });

    it('passes on the status and message of known errors', async () => {
      const genres = vi.fn().mockRejectedValue(new UnavailableError('Deezer is down'));
      const res = await setup({ catalog: { genres } as unknown as Services['catalog'] })('/v1/catalog/genres', { token: USER_TOKEN });
      expect(res.status).toBe(503);
      expect(await res.json()).toEqual({ error: { code: 'unavailable', message: 'Deezer is down' } });
    });

    it('hides the details of unexpected errors', async () => {
      const genres = vi.fn().mockRejectedValue(new Error('connection string postgres://user:pass@db'));
      const res = await setup({ catalog: { genres } as unknown as Services['catalog'] })('/v1/catalog/genres', { token: USER_TOKEN });
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: { code: 'internal', message: 'Something went wrong' } });
    });
  });
});
