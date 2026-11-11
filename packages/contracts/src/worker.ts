import { z } from 'zod';
import { idSchema } from './common.ts';
import { downloadOptionsSchema, ITEM_STAGES, trackHintSchema } from './downloads.ts';
import { AUDIO_CODECS, SONG_SOURCES } from './library.ts';

// Contracts for /v1/worker/*, the HTTP API the home worker calls. The worker
// never connects to Postgres; every state change goes through these endpoints.

const skipSchema = z.object({ status: z.literal('skip'), reason: z.string() });

export const claimRequestSchema = z.object({
  workerId: z.string().min(1).max(100),
  attempt: z.number().int().positive(),
});
export type ClaimRequest = z.infer<typeof claimRequestSchema>;

export const resolveClaimResponseSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('proceed'),
    download: z.object({ id: idSchema, url: z.string(), options: downloadOptionsSchema }),
  }),
  skipSchema,
]);
export type ResolveClaimResponse = z.infer<typeof resolveClaimResponseSchema>;

export const resolvedEntrySchema = z.object({
  url: z.url(),
  title: z.string(),
  artist: z.string().nullable(),
  durationSec: z.number().int().nullable(),
});
export type ResolvedEntry = z.infer<typeof resolvedEntrySchema>;

export const resolveCompleteSchema = z.object({
  title: z.string(),
  entries: z.array(resolvedEntrySchema).max(5000),
});
export type ResolveComplete = z.infer<typeof resolveCompleteSchema>;

export const itemInputSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('url'), url: z.string() }),
  z.object({ kind: z.literal('catalog'), hint: trackHintSchema }),
  z.object({ kind: z.literal('upload'), key: z.string(), filename: z.string() }),
]);
export type ItemInput = z.infer<typeof itemInputSchema>;

export const itemClaimResponseSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('proceed'),
    item: z.object({
      id: idSchema,
      downloadId: idSchema,
      input: itemInputSchema,
      options: downloadOptionsSchema,
      // Set for uploads: a short-lived URL the worker downloads the original file from.
      inputUrl: z.url().nullable(),
    }),
  }),
  skipSchema,
]);
export type ItemClaimResponse = z.infer<typeof itemClaimResponseSchema>;
export type ClaimedItem = Extract<ItemClaimResponse, { status: 'proceed' }>['item'];

export const itemSourceSchema = z.object({
  source: z.enum(SONG_SOURCES),
  sourceId: z.string().min(1).max(200),
  sourceUrl: z.string().nullable(),
  isrc: z.string().nullable(),
  // What the worker found, shown in the downloads list while the item is processed.
  title: z.string().min(1).max(300).optional(),
  artist: z.string().max(300).nullable().optional(),
});
export type ItemSource = z.infer<typeof itemSourceSchema>;

export const itemSourceResponseSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('proceed'), songId: idSchema }),
  z.object({ status: z.literal('duplicate'), songId: idSchema }),
  skipSchema,
]);
export type ItemSourceResponse = z.infer<typeof itemSourceResponseSchema>;

export const itemStageSchema = z.object({ stage: z.enum(ITEM_STAGES) });

export const uploadUrlsRequestSchema = z.object({
  codec: z.enum(AUDIO_CODECS),
  hasCover: z.boolean(),
});
export type UploadUrlsRequest = z.infer<typeof uploadUrlsRequestSchema>;

const presignedTargetSchema = z.object({ key: z.string(), url: z.url(), contentType: z.string() });
export const uploadUrlsResponseSchema = z.object({
  audio: presignedTargetSchema,
  cover: presignedTargetSchema.nullable(),
});
export type UploadUrlsResponse = z.infer<typeof uploadUrlsResponseSchema>;

export const itemCompleteSchema = z.object({
  source: itemSourceSchema.pick({ source: true, sourceId: true, sourceUrl: true }),
  title: z.string().min(1).max(300),
  artist: z.string().min(1).max(300),
  album: z.string().max(300).nullable(),
  albumArtist: z.string().max(300).nullable(),
  year: z.number().int().nullable(),
  genre: z.string().max(100).nullable(),
  trackNumber: z.number().int().nullable(),
  discNumber: z.number().int().nullable(),
  isrc: z.string().max(20).nullable(),
  durationMs: z.number().int().nonnegative(),
  audio: z.object({
    codec: z.enum(AUDIO_CODECS),
    bitrateKbps: z.number().int().nullable(),
    sizeBytes: z.number().int().positive(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
  }),
  cover: z.object({ color: z.string().nullable() }).nullable(),
  lyrics: z.object({ plain: z.string().nullable(), synced: z.string().nullable() }).nullable(),
  loudness: z.object({ lufs: z.number(), gainDb: z.number() }).nullable(),
});
export type ItemComplete = z.infer<typeof itemCompleteSchema>;

export const itemFailSchema = z.object({
  error: z.string().max(2000),
  // false when the job will be retried later, true when this was the last try.
  final: z.boolean(),
});
export type ItemFail = z.infer<typeof itemFailSchema>;

export const resolveFailSchema = itemFailSchema;
export type ResolveFail = ItemFail;
