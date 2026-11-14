import { chartsQuerySchema, searchQuerySchema, trendingQuerySchema } from '@audiostash/contracts';
import { Hono } from 'hono';
import * as ctrl from '../controllers/catalog.ts';
import type { AppEnv } from '../lib/types.ts';
import { validate } from '../lib/validation.ts';
import { requireUser } from '../middleware/auth.ts';

export const catalogRouter = new Hono<AppEnv>();
catalogRouter.use('*', requireUser);

catalogRouter.get('/genres', ctrl.genres);
catalogRouter.get('/charts', validate('query', chartsQuerySchema), (c) => ctrl.charts(c, c.req.valid('query')));
catalogRouter.get('/trending', validate('query', trendingQuerySchema), (c) => ctrl.trending(c, c.req.valid('query')));
catalogRouter.get('/search', validate('query', searchQuerySchema), (c) => ctrl.search(c, c.req.valid('query')));
catalogRouter.get('/for-you', ctrl.forYou);
catalogRouter.get('/youtube', validate('query', searchQuerySchema), (c) => ctrl.youtube(c, c.req.valid('query')));
