import { createContext } from './context.ts';
import { loadEnv } from './env.ts';
import { createLogger } from './lib/logger.ts';

// Docker waits 10 seconds after SIGTERM by default before killing the process.
// The worker's compose file raises that, and this stays just under it.
const SHUTDOWN_TIMEOUT_MS = 25_000;

const env = loadEnv();
const logger = createLogger({ level: env.LOG_LEVEL, pretty: env.NODE_ENV === 'development' });
const ctx = createContext(env, logger);

try {
  await ctx.start();
} catch (error) {
  logger.fatal({ err: error }, 'worker failed to start');
  process.exit(1);
}

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'shutting down, waiting for running jobs');

  // A long download may not finish in time. Exiting is safe: its message was
  // never acknowledged, so RabbitMQ gives it to the worker again after a restart.
  setTimeout(() => {
    logger.warn({}, 'running jobs did not finish in time, they will run again on the next start');
    process.exit(0);
  }, SHUTDOWN_TIMEOUT_MS).unref();

  await ctx.close();
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
