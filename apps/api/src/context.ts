import { hostname } from 'node:os';
import { createAppleChartsClient, createDeezerClient, createYoutubeClient } from '@pluck/catalog';
import type { StatusResponse } from '@pluck/contracts';
import { createDb } from '@pluck/db';
import { createEventPublisher, createJobPublisher, createRabbit } from '@pluck/messaging';
import { sql } from 'drizzle-orm';
import pkg from '../package.json' with { type: 'json' };
import type { Env } from './env.ts';
import type { Logger } from './lib/logger.ts';
import { createOutboxRelay } from './outbox/relay.ts';
import { startEventBridge } from './realtime/event-bridge.ts';
import { SseHub } from './realtime/sse-hub.ts';
import { createWorkerStatus } from './realtime/worker-status.ts';
import { type AuthService, createAuthService } from './services/auth.ts';
import { type CatalogService, createCatalogService } from './services/catalog.ts';
import { createClerk } from './services/clerk.ts';
import { createDownloadService, type DownloadService } from './services/downloads.ts';
import { createFileService, type FileService } from './services/files.ts';
import { createNotifier } from './services/notifier.ts';
import { createS3Storage } from './services/storage.ts';
import { createSyncService, type SyncService } from './services/sync.ts';
import { createWorkerJobService, type WorkerJobService } from './services/worker-jobs.ts';

export interface Services {
  auth: AuthService;
  catalog: CatalogService;
  downloads: DownloadService;
  files: FileService;
  sync: SyncService;
  workerJobs: WorkerJobService;
  sse: SseHub;
  status(): StatusResponse;
  ready(): Promise<{ database: boolean; rabbitmq: boolean }>;
}

export interface AppContext {
  logger: Logger;
  services: Services;
  start(): Promise<void>;
  close(): Promise<void>;
}

// The composition root: the one place that creates connections and wires services
// together. Everything else receives its dependencies as arguments, which keeps
// modules testable and makes the dependency graph visible in one file.
export function createContext(env: Env, logger: Logger): AppContext {
  const child = (component: string) => logger.child({ component });

  const { db, close: closeDb } = createDb(env.DATABASE_URL);
  const rabbit = createRabbit(env.RABBITMQ_URL, { name: `pluck-api@${hostname()}`, logger: child('rabbitmq') });
  const jobPublisher = createJobPublisher(rabbit);
  const eventPublisher = createEventPublisher(rabbit);

  const storage = createS3Storage(env, child('storage'));
  const notifier = createNotifier(eventPublisher, child('notifier'));
  const relay = createOutboxRelay({ db, publisher: jobPublisher, logger: child('outbox') });

  const sse = new SseHub();
  const workerStatus = createWorkerStatus({ onChange: ({ online, lastSeenAt }) => sse.broadcast({ type: 'worker.status', online, lastSeenAt }) });

  const http = { userAgent: `Pluck/${pkg.version} (personal music library)` };
  const services: Services = {
    auth: createAuthService({
      clerk: createClerk({ secretKey: env.CLERK_SECRET_KEY, jwtKey: env.CLERK_JWT_KEY }),
      allowedUserIds: env.CLERK_ALLOWED_USER_IDS,
      workerToken: env.WORKER_TOKEN,
    }),
    catalog: createCatalogService({
      db,
      deezer: createDeezerClient(http),
      apple: createAppleChartsClient(http),
      youtube: env.YOUTUBE_API_KEY ? createYoutubeClient({ ...http, apiKey: env.YOUTUBE_API_KEY }) : null,
    }),
    downloads: createDownloadService({ db, storage, notifier, relay }),
    files: createFileService({ db, storage }),
    sync: createSyncService({ db, storage, notifier }),
    workerJobs: createWorkerJobService({ db, storage, notifier, relay }),
    sse,
    status: () => ({ api: { version: pkg.version }, worker: workerStatus.snapshot() }),
    async ready() {
      const database = await db.execute(sql`select 1`).then(
        () => true,
        () => false,
      );
      return { database, rabbitmq: rabbit.ready };
    },
  };

  let eventBridge: ReturnType<typeof startEventBridge> | null = null;

  return {
    logger,
    services,
    async start() {
      if (env.S3_CREATE_BUCKET) await storage.ensureBucket();
      relay.start();
      eventBridge = startEventBridge(rabbit, { sse, workerStatus, logger: child('events') });
    },
    // Reverse order of creation: stop taking work, finish what is in flight, then disconnect.
    async close() {
      sse.closeAll();
      workerStatus.stop();
      await relay.stop();
      await eventBridge?.close();
      await jobPublisher.close();
      await eventPublisher.close();
      await rabbit.close();
      await closeDb();
    },
  };
}
