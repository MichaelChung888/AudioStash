import { Hono } from 'hono';
import * as ctrl from '../controllers/system.ts';
import type { AppEnv } from '../lib/types.ts';
import { requireUser } from '../middleware/auth.ts';

// Liveness and readiness probes are public: Docker and uptime monitors call them without a token.
export const healthRouter = new Hono<AppEnv>();
healthRouter.get('/health', (c) => c.json({ status: 'ok' }));
healthRouter.get('/ready', ctrl.ready);

export const statusRouter = new Hono<AppEnv>();
statusRouter.use('*', requireUser);
statusRouter.get('/status', ctrl.status);
statusRouter.get('/events', ctrl.events);
