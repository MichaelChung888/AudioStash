import { sessionIdParamSchema } from '@pluck/contracts';
import { Hono } from 'hono';
import * as ctrl from '../controllers/sessions.ts';
import type { AppEnv } from '../lib/types.ts';
import { validate } from '../lib/validation.ts';
import { requireUser } from '../middleware/auth.ts';

export const sessionsRouter = new Hono<AppEnv>();
sessionsRouter.use('*', requireUser);

sessionsRouter.get('/', ctrl.listSessions);
sessionsRouter.delete('/:id', validate('param', sessionIdParamSchema), (c) => ctrl.revokeSession(c, c.req.valid('param').id));
