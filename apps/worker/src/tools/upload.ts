import { readFile } from 'node:fs/promises';
import { backoff } from '../lib/backoff.ts';

export interface UploadTarget {
  url: string;
  contentType: string;
}

interface Options {
  fetch?: typeof fetch;
  timeoutMs?: number;
  retries?: number;
}

export class UploadError extends Error {
  override name = 'UploadError';
  readonly status: number;

  constructor(status: number, body: string) {
    super(`Upload failed with HTTP ${status}${body ? `: ${body.slice(0, 300)}` : ''}`);
    this.status = status;
  }
}

// Uploads go straight to the bucket with a presigned URL: a URL the API signed
// that allows one PUT to one key for a limited time. The file never passes
// through the API, so the API's small server does not carry the audio traffic.
export function createUploader(options: Options = {}) {
  const doFetch = options.fetch ?? fetch;
  const retries = options.retries ?? 3;

  return {
    async put(target: UploadTarget, path: string): Promise<void> {
      // Read into memory rather than streamed: a streamed body is sent in chunks
      // with no Content-Length, and S3 and R2 reject presigned PUTs without one.
      // Songs are tens of megabytes at most, so this is fine.
      const body = await readFile(path);

      for (let attempt = 0; ; attempt++) {
        let response: Response;
        try {
          response = await doFetch(target.url, {
            method: 'PUT',
            headers: { 'content-type': target.contentType },
            body,
            signal: AbortSignal.timeout(options.timeoutMs ?? 10 * 60_000),
          });
        } catch (error) {
          if (attempt < retries) {
            await backoff(attempt, 1000);
            continue;
          }
          throw error;
        }

        if (response.ok) return;
        const error = new UploadError(response.status, await response.text().catch(() => ''));
        // 4xx will not change on a retry: usually an expired or wrongly signed URL.
        if (response.status < 500 || attempt >= retries) throw error;
        await backoff(attempt, 1000);
      }
    },
  };
}

export type Uploader = ReturnType<typeof createUploader>;
