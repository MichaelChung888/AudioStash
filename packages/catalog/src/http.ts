import type { z } from 'zod';

export class HttpError extends Error {
  override name = 'HttpError';
  readonly status: number;
  readonly url: string;

  constructor(status: number, url: string, message?: string) {
    super(message ?? `HTTP ${status} from ${url}`);
    this.status = status;
    this.url = url;
  }
}

export interface HttpOptions {
  userAgent: string;
  timeoutMs?: number;
  retries?: number;
  fetch?: typeof fetch;
}

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

// GET a JSON document and validate it. Retries rate limits and server errors with
// exponential backoff plus jitter (a random extra wait), so many clients retrying
// at once do not all hit the server at the same moment.
export async function getJson<S extends z.ZodType>(url: string, schema: S, options: HttpOptions): Promise<z.infer<S>> {
  const doFetch = options.fetch ?? fetch;
  const retries = options.retries ?? 2;

  for (let attempt = 0; ; attempt++) {
    let response: Response;
    try {
      response = await doFetch(url, {
        headers: { 'user-agent': options.userAgent, accept: 'application/json' },
        signal: AbortSignal.timeout(options.timeoutMs ?? 10_000),
      });
    } catch (error) {
      if (attempt < retries) {
        await backoff(attempt);
        continue;
      }
      throw error;
    }

    if (response.ok) return schema.parse(await response.json());
    if (RETRYABLE_STATUS.has(response.status) && attempt < retries) {
      await backoff(attempt);
      continue;
    }
    throw new HttpError(response.status, url);
  }
}

export function backoff(attempt: number): Promise<void> {
  const ms = 250 * 2 ** attempt + Math.random() * 250;
  return new Promise((resolve) => setTimeout(resolve, ms));
}
