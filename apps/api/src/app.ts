import type { ErrorBody, ErrorCode } from '@audiostash/contracts';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { requestId } from 'hono/request-id';
import { secureHeaders } from 'hono/secure-headers';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { AppContext } from './context.ts';
import { AppError } from './lib/errors.ts';
import type { AppEnv } from './lib/types.ts';
import { requestLogger } from './middleware/request-logger.ts';
import { catalogRouter } from './routes/catalog.ts';
import { downloadsRouter } from './routes/downloads.ts';
import { songsRouter, syncRouter, uploadsRouter } from './routes/library.ts';
import { sessionsRouter } from './routes/sessions.ts';
import { healthRouter, statusRouter } from './routes/system.ts';
import { workerRouter } from './routes/worker.ts';

// Kept separate from index.ts so tests can call app.request() without opening a port.
export function createApp(ctx: AppContext) {
  const app = new Hono<AppEnv>();

  app.use(requestId());
  app.use(secureHeaders());
  app.use(async (c, next) => {
    c.set('services', ctx.services);
    await next();
  });
  app.use(requestLogger(ctx.logger));

  app.route('/', healthRouter);
  app.route('/v1', statusRouter);
  app.route('/v1/catalog', catalogRouter);
  app.route('/v1/downloads', downloadsRouter);
  app.route('/v1/sessions', sessionsRouter);
  app.route('/v1/songs', songsRouter);
  app.route('/v1/sync', syncRouter);
  app.route('/v1/uploads', uploadsRouter);
  app.route('/v1/worker', workerRouter);

  app.notFound((c) => c.json(errorBody('not_found', 'Route not found'), 404));

  // The only place errors become HTTP responses.
  app.onError((err, c) => {
    if (err instanceof AppError) return c.json(errorBody(err.code, err.message, err.details), err.status);
    // Hono's own errors, e.g. malformed JSON in a request body.
    if (err instanceof HTTPException) {
      const status = err.status as ContentfulStatusCode;
      return c.json(errorBody(status === 401 ? 'unauthorized' : 'bad_request', err.message), status);
    }
    (c.get('log') ?? ctx.logger).error({ err }, 'unhandled error');
    return c.json(errorBody('internal', 'Something went wrong'), 500);
  });

  return app;
}

function errorBody(code: ErrorCode, message: string, details?: unknown): ErrorBody {
  return { error: { code, message, ...(details === undefined ? {} : { details }) } };
}
