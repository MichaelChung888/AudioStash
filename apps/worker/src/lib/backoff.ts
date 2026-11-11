// Exponential backoff with jitter: each retry waits about twice as long as the last,
// plus a random extra, so many clients retrying at once spread out.
export function backoff(attempt: number, baseMs = 500): Promise<void> {
  const ms = baseMs * 2 ** attempt + Math.random() * baseMs;
  return new Promise((resolve) => setTimeout(resolve, ms));
}
