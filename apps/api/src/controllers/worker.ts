// Handlers for /v1/worker, called only by the home worker.
import type { ClaimRequest, ItemComplete, ItemFail, ItemSource, ItemStage, ResolveComplete, ResolveFail, UploadUrlsRequest } from '@audiostash/contracts';
import type { Context } from 'hono';
import type { AppEnv } from '../lib/types.ts';

export async function claimResolve(c: Context<AppEnv>, downloadId: string, claim: ClaimRequest) {
  const response = await c.get('services').workerJobs.claimResolve(downloadId);
  c.get('log').info({ downloadId, workerId: claim.workerId, attempt: claim.attempt, status: response.status }, 'resolve claimed');
  return c.json(response);
}

export async function completeResolve(c: Context<AppEnv>, downloadId: string, body: ResolveComplete) {
  await c.get('services').workerJobs.completeResolve(downloadId, body);
  c.get('log').info({ downloadId, entries: body.entries.length }, 'download resolved');
  return c.body(null, 204);
}

export async function failResolve(c: Context<AppEnv>, downloadId: string, body: ResolveFail) {
  await c.get('services').workerJobs.failResolve(downloadId, body);
  return c.body(null, 204);
}

export async function claimItem(c: Context<AppEnv>, itemId: string, claim: ClaimRequest) {
  return c.json(await c.get('services').workerJobs.claimItem(itemId, claim));
}

export async function reportSource(c: Context<AppEnv>, itemId: string, body: ItemSource) {
  return c.json(await c.get('services').workerJobs.reportSource(itemId, body));
}

export async function setStage(c: Context<AppEnv>, itemId: string, stage: ItemStage) {
  await c.get('services').workerJobs.setStage(itemId, stage);
  return c.body(null, 204);
}

export async function uploadUrls(c: Context<AppEnv>, itemId: string, body: UploadUrlsRequest) {
  return c.json(await c.get('services').workerJobs.uploadUrls(itemId, body));
}

export async function completeItem(c: Context<AppEnv>, itemId: string, body: ItemComplete) {
  const result = await c.get('services').workerJobs.completeItem(itemId, body);
  c.get('log').info({ itemId, songId: result.songId }, 'item completed');
  return c.json(result);
}

export async function failItem(c: Context<AppEnv>, itemId: string, body: ItemFail) {
  await c.get('services').workerJobs.failItem(itemId, body);
  c.get('log').warn({ itemId, final: body.final, error: body.error }, 'item attempt failed');
  return c.body(null, 204);
}
