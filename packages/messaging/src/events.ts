import { type BusEvent, busEventSchema } from '@audiostash/contracts';
import type { Connection } from 'rabbitmq-client';
import type { Logger } from './logger.ts';
import { EXCHANGES, eventsExchange } from './topology.ts';

// Events are notifications, not work. Losing one is harmless because phones
// re-read state on reconnect, so events skip publisher confirms and durable storage.

export interface EventPublisher {
  publish(event: BusEvent): Promise<void>;
  close(): Promise<void>;
}

export function createEventPublisher(rabbit: Connection): EventPublisher {
  const publisher = rabbit.createPublisher({ exchanges: [eventsExchange] });
  return {
    publish: (event) => publisher.send({ exchange: EXCHANGES.events, routingKey: event.type, contentType: 'application/json' }, event),
    close: () => publisher.close(),
  };
}

// Each subscriber gets its own temporary queue (exclusive, deleted on disconnect),
// so every API instance receives every event: a fan-out.
export function subscribeEvents(rabbit: Connection, options: { patterns: string[]; logger: Logger; handler: (event: BusEvent) => void | Promise<void> }) {
  const consumer = rabbit.createConsumer(
    {
      queue: '',
      queueOptions: { exclusive: true, autoDelete: true, durable: false, arguments: { 'x-message-ttl': 60_000 } },
      exchanges: [eventsExchange],
      // An empty queue name in a binding means "the queue just declared on this channel".
      queueBindings: options.patterns.map((routingKey) => ({ exchange: EXCHANGES.events, routingKey })),
      noAck: true,
    },
    async (msg) => {
      const parsed = busEventSchema.safeParse(msg.body);
      if (!parsed.success) {
        options.logger.warn({ routingKey: msg.routingKey, issues: parsed.error.issues }, 'ignoring invalid event');
        return;
      }
      await options.handler(parsed.data);
    },
  );
  consumer.on('error', (err) => options.logger.error({ err }, 'event consumer error'));
  return consumer;
}
