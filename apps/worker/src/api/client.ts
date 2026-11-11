import {
  type ClaimRequest,
  errorBodySchema,
  type ItemComplete,
  type ItemFail,
  type ItemSource,
  type ItemStage,
  itemClaimResponseSchema,
  itemSourceResponseSchema,
  type ResolveComplete,
  type ResolveFail,
  resolveClaimResponseSchema,
  type UploadUrlsRequest,
  uploadUrlsResponseSchema,
} from '@pluck/contracts';
import { z } from 'zod';
import { backoff } from '../lib/backoff.ts';

export class ApiError extends Error {
  override name = 'ApiError';
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }

  // 409: the item was cancelled or finished elsewhere. 404: its download was removed.
  // Either way the work is no longer wanted.
  get isGone(): boolean {
    return this.status === 409 || this.status === 404;
  }
}

interface Options {
  baseUrl: string;
  token: string;
  userAgent: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
  retries?: number;
}

const RETRYABLE_STATUS = new Set([502, 503, 504]);
const completeResponseSchema = z.object({ songId: z.string() });

// Every /v1/worker endpoint is safe to call twice: claims can be repeated, and a
// repeated completion returns the first result. So requests are retried after
// network errors and gateway errors, which happen when the API restarts.
export function createApiClient(options: Options) {
  const doFetch = options.fetch ?? fetch;
  const retries = options.retries ?? 3;

  async function post<S extends z.ZodType>(path: string, body: unknown, schema: S): Promise<z.infer<S>>;
  async function post(path: string, body: unknown): Promise<void>;
  async function post(path: string, body: unknown, schema?: z.ZodType): Promise<unknown> {
    for (let attempt = 0; ; attempt++) {
      let response: Response;
      try {
        response = await doFetch(`${options.baseUrl}/v1/worker${path}`, {
          method: 'POST',
          headers: { authorization: `Bearer ${options.token}`, 'content-type': 'application/json', 'user-agent': options.userAgent },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(options.timeoutMs ?? 30_000),
        });
      } catch (error) {
        if (attempt < retries) {
          await backoff(attempt);
          continue;
        }
        throw error;
      }

      if (RETRYABLE_STATUS.has(response.status) && attempt < retries) {
        await backoff(attempt);
        continue;
      }
      if (!response.ok) throw await toApiError(response);
      return schema ? schema.parse(await response.json()) : undefined;
    }
  }

  return {
    claimResolve: (downloadId: string, claim: ClaimRequest) => post(`/downloads/${downloadId}/claim`, claim, resolveClaimResponseSchema),
    completeResolve: (downloadId: string, body: ResolveComplete) => post(`/downloads/${downloadId}/resolved`, body),
    failResolve: (downloadId: string, body: ResolveFail) => post(`/downloads/${downloadId}/fail`, body),
    claimItem: (itemId: string, claim: ClaimRequest) => post(`/items/${itemId}/claim`, claim, itemClaimResponseSchema),
    reportSource: (itemId: string, body: ItemSource) => post(`/items/${itemId}/source`, body, itemSourceResponseSchema),
    setStage: (itemId: string, stage: ItemStage) => post(`/items/${itemId}/stage`, { stage }),
    uploadUrls: (itemId: string, body: UploadUrlsRequest) => post(`/items/${itemId}/upload-urls`, body, uploadUrlsResponseSchema),
    completeItem: (itemId: string, body: ItemComplete) => post(`/items/${itemId}/complete`, body, completeResponseSchema),
    failItem: (itemId: string, body: ItemFail) => post(`/items/${itemId}/fail`, body),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;

async function toApiError(response: Response): Promise<ApiError> {
  const parsed = errorBodySchema.safeParse(await response.json().catch(() => null));
  if (parsed.success) return new ApiError(response.status, parsed.data.error.code, parsed.data.error.message);
  return new ApiError(response.status, 'unknown', `API responded with HTTP ${response.status}`);
}
