interface Entry<T> {
  value: T;
  expiresAt: number;
}

// In-memory cache for third-party catalog responses. Concurrent requests for the
// same key share one upstream call instead of each making their own.
export class TtlCache<T> {
  readonly #entries = new Map<string, Entry<T>>();
  readonly #inFlight = new Map<string, Promise<T>>();
  readonly #ttlMs: number;
  readonly #maxEntries: number;

  constructor(options: { ttlMs: number; maxEntries?: number }) {
    this.#ttlMs = options.ttlMs;
    this.#maxEntries = options.maxEntries ?? 500;
  }

  async get(key: string, load: () => Promise<T>, shouldCache: (value: T) => boolean = () => true): Promise<T> {
    const entry = this.#entries.get(key);
    if (entry && entry.expiresAt > Date.now()) return entry.value;

    const pending = this.#inFlight.get(key);
    if (pending) return pending;

    const promise = load()
      .then((value) => {
        if (shouldCache(value)) this.#set(key, value);
        return value;
      })
      .finally(() => this.#inFlight.delete(key));
    this.#inFlight.set(key, promise);
    return promise;
  }

  #set(key: string, value: T): void {
    // Maps iterate in insertion order, so the first key is the oldest.
    if (this.#entries.size >= this.#maxEntries) {
      const oldest = this.#entries.keys().next().value;
      if (oldest !== undefined) this.#entries.delete(oldest);
    }
    this.#entries.set(key, { value, expiresAt: Date.now() + this.#ttlMs });
  }
}
