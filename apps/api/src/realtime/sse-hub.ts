import type { ClientEvent } from '@audiostash/contracts';

interface Subscriber {
  // The Clerk session that opened the stream.
  sessionId: string;
  send: (event: ClientEvent) => void;
  close: () => void;
}

// The open Server-Sent Events connections on this API instance. Events reach it
// from RabbitMQ (see event-bridge.ts), so every instance can serve every phone.
export class SseHub {
  readonly #subscribers = new Set<Subscriber>();

  subscribe(subscriber: Subscriber): () => void {
    this.#subscribers.add(subscriber);
    return () => this.#subscribers.delete(subscriber);
  }

  broadcast(event: ClientEvent): void {
    for (const subscriber of this.#subscribers) subscriber.send(event);
  }

  // A stream is authenticated once, when it opens, so revoking its session has to end it.
  closeSession(sessionId: string): void {
    for (const subscriber of this.#subscribers) {
      if (subscriber.sessionId !== sessionId) continue;
      subscriber.close();
      this.#subscribers.delete(subscriber);
    }
  }

  // Ends every stream, so the HTTP server can finish shutting down.
  closeAll(): void {
    for (const subscriber of this.#subscribers) subscriber.close();
    this.#subscribers.clear();
  }

  get size(): number {
    return this.#subscribers.size;
  }
}
