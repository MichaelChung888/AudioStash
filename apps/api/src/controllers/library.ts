import type { CreateUploadsRequest, FileUrlsRequest, Mutation, PullQuery } from '@pluck/contracts';
import type { Context } from 'hono';
import type { AppEnv } from '../lib/types.ts';

export async function push(c: Context<AppEnv>, mutations: Mutation[]) {
  const response = await c.get('services').sync.push(c.get('user').sessionId, mutations);
  const rejected = response.results.filter((r) => r.status === 'rejected');
  if (rejected.length > 0) c.get('log').warn({ rejected }, 'sync mutations rejected');
  return c.json(response);
}

export async function pull(c: Context<AppEnv>, query: PullQuery) {
  return c.json(await c.get('services').sync.pull(query));
}

export async function songFileUrls(c: Context<AppEnv>, body: FileUrlsRequest) {
  return c.json(await c.get('services').files.songFileUrls(body.songIds));
}

export async function createUploads(c: Context<AppEnv>, body: CreateUploadsRequest) {
  return c.json(await c.get('services').files.createUploads(body), 201);
}
