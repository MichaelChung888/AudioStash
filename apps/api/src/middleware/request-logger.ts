import { createMiddleware } from 'hono/factory';
import type { Logger } from '../lib/logger.ts';
import type { AppEnv } from '../lib/types.ts';

const QUIET_PATHS = new Set(['/health', '/ready']);

// Gives each request a child logger tagged with its request id, and logs one line
// when the response is ready.
export function requestLogger(logger: Logger) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const log = logger.child({ requestId: c.get('requestId') });
    c.set('log', log);
    const started = performance.now();
    await next();

    const fields = { method: c.req.method, path: c.req.path, status: c.res.status, durationMs: Math.round(performance.now() - started) };
    if (c.res.status >= 500) log.error(fields, 'request failed');
    else if (!QUIET_PATHS.has(c.req.path)) log.info(fields, 'request');
  });
}
