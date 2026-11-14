import { errorBodySchema } from '@audiostash/contracts';
import { getClerkInstance } from '@clerk/expo';
import type { z } from 'zod';
import { config } from '../config.ts';

export class ApiError extends Error {
  override name = 'ApiError';
  // 0 when the server could not be reached at all.
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string, options?: ErrorOptions) {
    super(message, options);
    this.status = status;
    this.code = code;
  }

  get isOffline(): boolean {
    return this.status === 0;
  }
}

// Clerk session tokens last about a minute. getToken() returns the cached one
// until it is nearly expired, so calling it before every request is cheap.
export async function getSessionToken(): Promise<string> {
  const token = await getClerkInstance().session?.getToken();
  if (!token) throw new ApiError(401, 'unauthorized', 'You are signed out.');
  return token;
}

interface RequestOptions<T> {
  method?: 'GET' | 'POST' | 'DELETE';
  body?: unknown;
  schema?: z.ZodType<T>;
  signal?: AbortSignal;
}

export async function request<T = void>(path: string, { method = 'GET', body, schema, signal }: RequestOptions<T> = {}): Promise<T> {
  const token = await getSessionToken();
  const headers: Record<string, string> = { authorization: `Bearer ${token}` };
  if (body !== undefined) headers['content-type'] = 'application/json';

  let response: Response;
  try {
    response = await fetch(`${config.apiUrl}${path}`, { method, headers, signal, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch (err) {
    throw new ApiError(0, 'offline', 'Could not reach the server.', { cause: err });
  }

  if (response.status === 204) return undefined as T;
  const json: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const parsed = errorBodySchema.safeParse(json);
    if (parsed.success) throw new ApiError(response.status, parsed.data.error.code, parsed.data.error.message);
    throw new ApiError(response.status, 'internal', `The server answered ${response.status}.`);
  }
  return schema ? schema.parse(json) : (json as T);
}

// React Native's URLSearchParams lacks parts of the standard, so build query strings by hand.
export function query(params: Record<string, string | number | undefined>): string {
  const pairs = Object.entries(params)
    .filter((pair): pair is [string, string | number] => pair[1] !== undefined)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  return pairs.length ? `?${pairs.join('&')}` : '';
}

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  return 'Something went wrong.';
}
