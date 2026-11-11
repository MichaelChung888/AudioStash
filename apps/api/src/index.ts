import { serve } from '@hono/node-server';
import { createApp } from './app.ts';
import { createContext } from './context.ts';
import { loadEnv } from './env.ts';
import { createLogger } from './lib/logger.ts';

const SHUTDOWN_TIMEOUT_MS = 10_000;

const env = loadEnv();
const logger = createLogger({ level: env.LOG_LEVEL, pretty: env.NODE_ENV === 'development' });
const ctx = createContext(env, logger);
await ctx.start();

const server = serve({ fetch: createApp(ctx).fetch, port: env.PORT, hostname: '0.0.0.0' }, (info) => {
  logger.info({ port: info.port }, 'api listening');
});

// Docker sends SIGTERM on `docker compose down` and on redeploys. Stop accepting
// connections, let in-flight requests finish, then close connections cleanly.
let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'shutting down');
  setTimeout(() => {
    logger.error({}, 'shutdown timed out, exiting');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS).unref();

  // SSE streams never end on their own, so they are closed before the server waits for connections.
  ctx.services.sse.closeAll();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await ctx.close();
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
