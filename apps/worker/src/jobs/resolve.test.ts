import type { ResolveComplete, ResolvedEntry } from '@pluck/contracts';
import { describe, expect, it, vi } from 'vitest';
import { type ApiClient, ApiError } from '../api/client.ts';
import { silentLogger } from '../testing/logger.ts';
import { createResolveJob } from './resolve.ts';

const DOWNLOAD_ID = '00000000-0000-4000-8000-000000000002';
const context = { messageId: 'm', attempt: 2, isLastAttempt: false };

const entry = (n: number): ResolvedEntry => ({
  url: `https://www.youtube.com/watch?v=${String(n).padStart(11, '0')}`,
  title: `Song ${n}`,
  artist: null,
  durationSec: null,
});

function setup(entries: ResolvedEntry[] = [entry(1), entry(2)]) {
  const api = {
    claimResolve: vi.fn(async () => ({
      status: 'proceed' as const,
      download: { id: DOWNLOAD_ID, url: 'https://www.youtube.com/playlist?list=PL1', options: {} },
    })),
    completeResolve: vi.fn(async (_id: string, _body: ResolveComplete) => {}),
    failResolve: vi.fn(async () => {}),
  };
  const ytdlp = { listCollection: vi.fn(async () => ({ title: 'Road Trip', entries })) };
  const job = createResolveJob({ api: api as unknown as ApiClient, ytdlp, workerId: 'home-pc', logger: silentLogger });
  return { job, api, ytdlp };
}

describe('download.resolve job', () => {
  it('lists the playlist and sends its songs to the API', async () => {
    const { job, api, ytdlp } = setup();
    await job.handle({ downloadId: DOWNLOAD_ID }, context);

    expect(api.claimResolve).toHaveBeenCalledWith(DOWNLOAD_ID, { workerId: 'home-pc', attempt: 2 });
    expect(ytdlp.listCollection).toHaveBeenCalledWith('https://www.youtube.com/playlist?list=PL1');
    expect(api.completeResolve).toHaveBeenCalledWith(DOWNLOAD_ID, { title: 'Road Trip', entries: [entry(1), entry(2)] });
  });

  it('keeps at most 5000 songs, the most the API accepts', async () => {
    const { job, api } = setup(Array.from({ length: 5001 }, (_, i) => entry(i)));
    await job.handle({ downloadId: DOWNLOAD_ID }, context);
    const [, body] = api.completeResolve.mock.calls[0] ?? [];
    expect(body?.entries).toHaveLength(5000);
  });

  it('does nothing when the claim says to skip', async () => {
    const { job, api, ytdlp } = setup();
    api.claimResolve.mockResolvedValueOnce({ status: 'skip', reason: 'Download is cancelled' } as never);
    await job.handle({ downloadId: DOWNLOAD_ID }, context);
    expect(ytdlp.listCollection).not.toHaveBeenCalled();
  });

  it('stops quietly when the download was removed while listing', async () => {
    const { job, api } = setup();
    api.completeResolve.mockRejectedValueOnce(new ApiError(404, 'not_found', 'Download not found'));
    await expect(job.handle({ downloadId: DOWNLOAD_ID }, context)).resolves.toBeUndefined();
  });

  it('reports a failure to the API', async () => {
    const { job, api } = setup();
    await job.onFailure({ downloadId: DOWNLOAD_ID }, { ...context, error: new Error('Playlist does not exist'), final: true });
    expect(api.failResolve).toHaveBeenCalledWith(DOWNLOAD_ID, { error: 'Playlist does not exist', final: true });
  });
});
