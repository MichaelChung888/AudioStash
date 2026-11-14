import type { ClientEvent } from '@audiostash/contracts';
import type { Context } from 'hono';
import { streamSSE } from 'hono/streaming';
import type { AppEnv } from '../lib/types.ts';

// Proxies such as Cloudflare close a connection that sends nothing for 100 seconds.
const KEEPALIVE_MS = 25_000;

export async function ready(c: Context<AppEnv>) {
  const checks = await c.get('services').ready();
  const ok = Object.values(checks).every(Boolean);
  return c.json({ status: ok ? 'ok' : 'unavailable', checks }, ok ? 200 : 503);
}

export function status(c: Context<AppEnv>) {
  return c.json(c.get('services').status());
}

// Server-Sent Events: one long-lived HTTP response the server keeps writing to.
// The phone reloads state when it reconnects, so missed events are never replayed.
export function events(c: Context<AppEnv>) {
  const { sse, status } = c.get('services');
  const log = c.get('log');

  return streamSSE(
    c,
    async (stream) => {
      const { promise: closed, resolve: close } = Promise.withResolvers<void>();
      const send = (event: ClientEvent) => {
        stream.writeSSE({ event: event.type, data: JSON.stringify(event) }).catch(() => close());
      };

      const unsubscribe = sse.subscribe({ sessionId: c.get('user').sessionId, send, close });
      stream.onAbort(close);
      const { worker } = status();
      send({ type: 'worker.status', online: worker.online, lastSeenAt: worker.lastSeenAt });
      const keepalive = setInterval(() => stream.writeSSE({ event: 'ping', data: '' }).catch(() => close()), KEEPALIVE_MS);

      await closed;
      clearInterval(keepalive);
      unsubscribe();
    },
    async (err) => {
      log.warn({ err }, 'event stream error');
    },
  );
}
