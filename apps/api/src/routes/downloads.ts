import { createDownloadSchema, idParamSchema, listDownloadsQuerySchema } from '@audiostash/contracts';
import { Hono } from 'hono';
import * as ctrl from '../controllers/downloads.ts';
import type { AppEnv } from '../lib/types.ts';
import { validate } from '../lib/validation.ts';
import { requireUser } from '../middleware/auth.ts';
import { userBodyLimit } from '../middleware/body-limit.ts';

export const downloadsRouter = new Hono<AppEnv>();
downloadsRouter.use('*', requireUser, userBodyLimit);

downloadsRouter.post('/', validate('json', createDownloadSchema), (c) => ctrl.createDownload(c, c.req.valid('json')));
downloadsRouter.get('/', validate('query', listDownloadsQuerySchema), (c) => ctrl.listDownloads(c, c.req.valid('query')));
downloadsRouter.get('/:id', validate('param', idParamSchema), (c) => ctrl.getDownload(c, c.req.valid('param').id));
downloadsRouter.post('/:id/cancel', validate('param', idParamSchema), (c) => ctrl.cancelDownload(c, c.req.valid('param').id));
downloadsRouter.post('/:id/retry', validate('param', idParamSchema), (c) => ctrl.retryDownload(c, c.req.valid('param').id));
downloadsRouter.delete('/:id', validate('param', idParamSchema), (c) => ctrl.removeDownload(c, c.req.valid('param').id));
