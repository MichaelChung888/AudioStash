import {
  claimRequestSchema,
  idParamSchema,
  itemCompleteSchema,
  itemFailSchema,
  itemSourceSchema,
  itemStageSchema,
  resolveCompleteSchema,
  resolveFailSchema,
  uploadUrlsRequestSchema,
} from '@pluck/contracts';
import { Hono } from 'hono';
import * as ctrl from '../controllers/worker.ts';
import type { AppEnv } from '../lib/types.ts';
import { validate } from '../lib/validation.ts';
import { requireWorker } from '../middleware/auth.ts';
import { workerBodyLimit } from '../middleware/body-limit.ts';

export const workerRouter = new Hono<AppEnv>();
workerRouter.use('*', requireWorker, workerBodyLimit);

const id = validate('param', idParamSchema);

workerRouter.post('/downloads/:id/claim', id, validate('json', claimRequestSchema), (c) => ctrl.claimResolve(c, c.req.valid('param').id, c.req.valid('json')));
workerRouter.post('/downloads/:id/resolved', id, validate('json', resolveCompleteSchema), (c) =>
  ctrl.completeResolve(c, c.req.valid('param').id, c.req.valid('json')),
);
workerRouter.post('/downloads/:id/fail', id, validate('json', resolveFailSchema), (c) => ctrl.failResolve(c, c.req.valid('param').id, c.req.valid('json')));

workerRouter.post('/items/:id/claim', id, validate('json', claimRequestSchema), (c) => ctrl.claimItem(c, c.req.valid('param').id, c.req.valid('json')));
workerRouter.post('/items/:id/source', id, validate('json', itemSourceSchema), (c) => ctrl.reportSource(c, c.req.valid('param').id, c.req.valid('json')));
workerRouter.post('/items/:id/stage', id, validate('json', itemStageSchema), (c) => ctrl.setStage(c, c.req.valid('param').id, c.req.valid('json').stage));
workerRouter.post('/items/:id/upload-urls', id, validate('json', uploadUrlsRequestSchema), (c) =>
  ctrl.uploadUrls(c, c.req.valid('param').id, c.req.valid('json')),
);
workerRouter.post('/items/:id/complete', id, validate('json', itemCompleteSchema), (c) => ctrl.completeItem(c, c.req.valid('param').id, c.req.valid('json')));
workerRouter.post('/items/:id/fail', id, validate('json', itemFailSchema), (c) => ctrl.failItem(c, c.req.valid('param').id, c.req.valid('json')));
