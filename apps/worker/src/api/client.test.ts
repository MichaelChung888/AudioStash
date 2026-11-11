import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, createApiClient } from './client.ts';

afterEach(() => {
  vi.useRealTimers();
});

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const errorBody = (code: string, message: string) => ({ error: { code, message } });

function setup(fetch: typeof globalThis.fetch) {
  return createApiClient({ baseUrl: 'http://api.test', token: 'secret-token', userAgent: 'test', fetch, retries: 2 });
}

describe('api client', () => {
  it('sends the token and parses the response', async () => {
    const fetch = vi.fn(async () => json({ status: 'skip', reason: 'Item is completed' }));
    const api = setup(fetch);

    await expect(api.claimItem('item-1', { workerId: 'pc', attempt: 1 })).resolves.toEqual({ status: 'skip', reason: 'Item is completed' });
    expect(fetch).toHaveBeenCalledWith(
      'http://api.test/v1/worker/items/item-1/claim',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ workerId: 'pc', attempt: 1 }),
        headers: expect.objectContaining({ authorization: 'Bearer secret-token' }),
      }),
    );
  });

  it('retries gateway errors and network errors', async () => {
    vi.useFakeTimers();
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 502 }))
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const result = setup(fetch).setStage('item-1', 'downloading');
    await vi.runAllTimersAsync();

    await expect(result).resolves.toBeUndefined();
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('gives up after the last retry', async () => {
    vi.useFakeTimers();
    const fetch = vi.fn(async () => new Response('', { status: 503 }));
    const result = setup(fetch).setStage('item-1', 'downloading');
    const assertion = expect(result).rejects.toMatchObject({ status: 503 });
    await vi.runAllTimersAsync();

    await assertion;
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('does not retry other errors, and reads the error body', async () => {
    const fetch = vi.fn(async () => json(errorBody('conflict', 'Item is cancelled'), 409));
    const error = await setup(fetch)
      .setStage('item-1', 'processing')
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 409, code: 'conflict', message: 'Item is cancelled', isGone: true });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('treats 404 as gone but not 400', async () => {
    expect(new ApiError(404, 'not_found', 'x').isGone).toBe(true);
    expect(new ApiError(400, 'bad_request', 'x').isGone).toBe(false);
  });

  it('copes with an error body that is not JSON', async () => {
    const fetch = vi.fn(async () => new Response('<html>', { status: 500 }));
    await expect(setup(fetch).failItem('item-1', { error: 'x', final: true })).rejects.toMatchObject({ code: 'unknown', status: 500 });
  });
});
