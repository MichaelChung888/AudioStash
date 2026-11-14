// HTTP-aware handlers for /v1/downloads. Validation happens in routes/downloads.ts;
// business rules live in services/downloads.ts. Errors propagate to app.onError.
import type { CreateDownload, ListDownloadsQuery } from '@audiostash/contracts';
import type { Context } from 'hono';
import type { AppEnv } from '../lib/types.ts';

export async function createDownload(c: Context<AppEnv>, body: CreateDownload) {
  const { detail, created } = await c.get('services').downloads.create(body);
  if (created) c.get('log').info({ downloadId: detail.id, sourceKind: body.source.kind, items: detail.items.length }, 'download created');
  return c.json(detail, created ? 201 : 200);
}

export async function listDownloads(c: Context<AppEnv>, query: ListDownloadsQuery) {
  return c.json({ downloads: await c.get('services').downloads.list(query) });
}

export async function getDownload(c: Context<AppEnv>, id: string) {
  return c.json(await c.get('services').downloads.get(id));
}

export async function cancelDownload(c: Context<AppEnv>, id: string) {
  return c.json(await c.get('services').downloads.cancel(id));
}

export async function retryDownload(c: Context<AppEnv>, id: string) {
  return c.json(await c.get('services').downloads.retry(id));
}

export async function removeDownload(c: Context<AppEnv>, id: string) {
  await c.get('services').downloads.remove(id);
  return c.body(null, 204);
}
