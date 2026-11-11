import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createUploader, UploadError } from './upload.ts';

let file: string;
beforeEach(async () => {
  file = join(await mkdtemp(join(tmpdir(), 'pluck-upload-')), 'audio.opus');
  await writeFile(file, Buffer.from('audio bytes'));
});
afterEach(async () => {
  vi.useRealTimers();
  await rm(join(file, '..'), { recursive: true, force: true });
});

const target = { url: 'https://bucket.test/songs/1/audio.opus?sig=x', contentType: 'audio/ogg' };

describe('uploader', () => {
  it('PUTs the whole file with its content type', async () => {
    const fetch = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => new Response(null, { status: 200 }));
    await createUploader({ fetch }).put(target, file);

    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(url).toBe(target.url);
    expect(init).toMatchObject({ method: 'PUT', headers: { 'content-type': 'audio/ogg' } });
    expect(Buffer.from(init?.body as Uint8Array).toString()).toBe('audio bytes');
  });

  it('retries server errors', async () => {
    vi.useFakeTimers();
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response('slow down', { status: 503 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    const result = createUploader({ fetch }).put(target, file);
    // The file is read before the first request, and that is real I/O, not a timer.
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    await vi.runAllTimersAsync();
    await expect(result).resolves.toBeUndefined();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('does not retry a rejected signature', async () => {
    const fetch = vi.fn(async () => new Response('<Error>SignatureDoesNotMatch</Error>', { status: 403 }));
    const error = await createUploader({ fetch })
      .put(target, file)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(UploadError);
    expect(error).toMatchObject({ status: 403 });
    expect(fetch).toHaveBeenCalledOnce();
  });
});
