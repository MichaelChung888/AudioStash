import { Hono } from 'hono';
import * as ctrl from '../controllers/system.ts';
import type { AppEnv } from '../lib/types.ts';
import { requireUser } from '../middleware/auth.ts';

// Liveness and readiness probes are public: Docker and uptime monitors call them without a token.
export const healthRouter = new Hono<AppEnv>();
healthRouter.get('/health', (c) => c.json({ status: 'ok' }));
healthRouter.get('/ready', ctrl.ready);

// Mounted at /v1, so adding requireUser has to go on each route instead. Otherwise it
// would also run for every other /v1 route, including the worker's.
export const statusRouter = new Hono<AppEnv>();
statusRouter.get('/status', requireUser, ctrl.status);
statusRouter.get('/events', requireUser, ctrl.events);
