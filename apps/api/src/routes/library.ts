import { createUploadsSchema, fileUrlsRequestSchema, pullQuerySchema, pushRequestSchema } from '@audiostash/contracts';
import { Hono } from 'hono';
import * as ctrl from '../controllers/library.ts';
import type { AppEnv } from '../lib/types.ts';
import { validate } from '../lib/validation.ts';
import { requireUser } from '../middleware/auth.ts';
import { userBodyLimit } from '../middleware/body-limit.ts';

export const syncRouter = new Hono<AppEnv>();
syncRouter.use('*', requireUser, userBodyLimit);
syncRouter.post('/push', validate('json', pushRequestSchema), (c) => ctrl.push(c, c.req.valid('json').mutations));
syncRouter.get('/pull', validate('query', pullQuerySchema), (c) => ctrl.pull(c, c.req.valid('query')));

export const songsRouter = new Hono<AppEnv>();
songsRouter.use('*', requireUser, userBodyLimit);
songsRouter.post('/file-urls', validate('json', fileUrlsRequestSchema), (c) => ctrl.songFileUrls(c, c.req.valid('json')));

export const uploadsRouter = new Hono<AppEnv>();
uploadsRouter.use('*', requireUser, userBodyLimit);
uploadsRouter.post('/', validate('json', createUploadsSchema), (c) => ctrl.createUploads(c, c.req.valid('json')));
