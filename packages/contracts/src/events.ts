import { z } from 'zod';
import { idSchema, timestampSchema } from './common.ts';
import { downloadItemSchema, downloadSchema, ITEM_STAGES } from './downloads.ts';

const itemProgressSchema = z.object({
  type: z.literal('download.item.progress'),
  downloadId: idSchema,
  itemId: idSchema,
  stage: z.enum(ITEM_STAGES),
  progress: z.number().min(0).max(1).nullable(),
});

const workerStatusSchema = z.object({
  type: z.literal('worker.status'),
  online: z.boolean(),
  lastSeenAt: timestampSchema.nullable(),
});

// Sent by the API to phones over Server-Sent Events (GET /v1/events).
export const clientEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('download.updated'), download: downloadSchema }),
  z.object({ type: z.literal('download.item.updated'), item: downloadItemSchema }),
  itemProgressSchema,
  z.object({ type: z.literal('library.changed'), cursor: z.number().int() }),
  workerStatusSchema,
]);
export type ClientEvent = z.infer<typeof clientEventSchema>;
export type ClientEventType = ClientEvent['type'];

// Published on the RabbitMQ events exchange. Every API instance receives every
// event and forwards the client-facing ones to its own SSE connections.
export const busEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('download.updated'), download: downloadSchema }),
  z.object({ type: z.literal('download.item.updated'), item: downloadItemSchema }),
  itemProgressSchema,
  z.object({ type: z.literal('library.changed'), cursor: z.number().int() }),
  z.object({
    type: z.literal('worker.heartbeat'),
    workerId: z.string(),
    version: z.string(),
    concurrency: z.number().int(),
    sentAt: timestampSchema,
  }),
]);
export type BusEvent = z.infer<typeof busEventSchema>;
export type BusEventType = BusEvent['type'];
