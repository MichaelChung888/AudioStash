import { z } from 'zod';
import { idSchema, timestampSchema } from './common.ts';

// best: keep the source's own audio stream, no re-encode, so no quality loss.
// m4a / mp3: convert for players that cannot read Opus. Converting lossy audio
// to another lossy format loses a little quality, it never adds any.
export const AUDIO_FORMATS = ['best', 'm4a', 'mp3'] as const;
export type AudioFormat = (typeof AUDIO_FORMATS)[number];

export const downloadOptionsSchema = z.object({
  format: z.enum(AUDIO_FORMATS).default('best'),
  metadata: z.boolean().default(true),
  cover: z.boolean().default(true),
  lyrics: z.boolean().default(true),
  removeNonMusic: z.boolean().default(true),
});
export type DownloadOptions = z.infer<typeof downloadOptionsSchema>;

// What we know about a track from a chart or search result, before we have audio for it.
export const trackHintSchema = z.object({
  title: z.string().min(1).max(300),
  artist: z.string().min(1).max(300),
  album: z.string().max(300).optional(),
  durationSec: z.number().int().positive().optional(),
  isrc: z.string().max(20).optional(),
  deezerId: z.number().int().positive().optional(),
  coverUrl: z.url().optional(),
});
export type TrackHint = z.infer<typeof trackHintSchema>;

export const uploadedFileSchema = z.object({
  key: z.string().regex(/^incoming\//),
  filename: z.string().min(1).max(255),
});
export type UploadedFile = z.infer<typeof uploadedFileSchema>;

export const downloadSourceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('url'), url: z.url() }),
  z.object({ kind: z.literal('catalog'), tracks: z.array(trackHintSchema).min(1).max(200) }),
  z.object({ kind: z.literal('upload'), files: z.array(uploadedFileSchema).min(1).max(500) }),
]);
export type DownloadSource = z.infer<typeof downloadSourceSchema>;
export type DownloadSourceKind = DownloadSource['kind'];

export const downloadTargetSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('library') }),
  z.object({ kind: z.literal('playlist'), playlistId: idSchema }),
  // name is optional: for a playlist link, the source playlist's title is used.
  z.object({ kind: z.literal('newPlaylist'), playlistId: idSchema, name: z.string().min(1).max(200).optional() }),
]);
export type DownloadTarget = z.infer<typeof downloadTargetSchema>;

// The client picks the id, so retrying the same request (e.g. from the phone's
// offline queue) cannot create a second download.
export const createDownloadSchema = z.object({
  id: idSchema,
  source: downloadSourceSchema,
  options: downloadOptionsSchema.default(downloadOptionsSchema.parse({})),
  target: downloadTargetSchema.default({ kind: 'library' }),
});
export type CreateDownloadRequest = z.input<typeof createDownloadSchema>;
export type CreateDownload = z.infer<typeof createDownloadSchema>;

export const DOWNLOAD_STATUSES = ['queued', 'resolving', 'active', 'completed', 'partial', 'failed', 'cancelled'] as const;
export type DownloadStatus = (typeof DOWNLOAD_STATUSES)[number];
export const FINISHED_DOWNLOAD_STATUSES: readonly DownloadStatus[] = ['completed', 'partial', 'failed', 'cancelled'];

export const ITEM_STATUSES = ['queued', 'active', 'completed', 'skipped', 'failed', 'cancelled'] as const;
export type ItemStatus = (typeof ITEM_STATUSES)[number];
export const FINISHED_ITEM_STATUSES: readonly ItemStatus[] = ['completed', 'skipped', 'failed', 'cancelled'];

export const ITEM_STAGES = ['matching', 'downloading', 'processing', 'uploading'] as const;
export type ItemStage = (typeof ITEM_STAGES)[number];

export const downloadCountsSchema = z.object({
  total: z.number().int(),
  completed: z.number().int(),
  skipped: z.number().int(),
  failed: z.number().int(),
  cancelled: z.number().int(),
});
export type DownloadCounts = z.infer<typeof downloadCountsSchema>;

export const downloadSchema = z.object({
  id: idSchema,
  title: z.string(),
  sourceKind: z.enum(['url', 'catalog', 'upload']),
  sourceUrl: z.string().nullable(),
  status: z.enum(DOWNLOAD_STATUSES),
  options: downloadOptionsSchema,
  playlistId: idSchema.nullable(),
  counts: downloadCountsSchema,
  error: z.string().nullable(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
  finishedAt: timestampSchema.nullable(),
});
export type Download = z.infer<typeof downloadSchema>;

export const downloadItemSchema = z.object({
  id: idSchema,
  downloadId: idSchema,
  position: z.number().int().nonnegative(),
  title: z.string(),
  artist: z.string().nullable(),
  status: z.enum(ITEM_STATUSES),
  stage: z.enum(ITEM_STAGES).nullable(),
  progress: z.number().min(0).max(1).nullable(),
  songId: idSchema.nullable(),
  attempts: z.number().int().nonnegative(),
  error: z.string().nullable(),
  updatedAt: timestampSchema,
});
export type DownloadItem = z.infer<typeof downloadItemSchema>;

export const downloadDetailSchema = downloadSchema.extend({
  items: z.array(downloadItemSchema),
});
export type DownloadDetail = z.infer<typeof downloadDetailSchema>;

export const listDownloadsQuerySchema = z.object({
  status: z.enum(['open', 'finished', 'all']).default('all'),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  before: timestampSchema.optional(),
});
export type ListDownloadsQuery = z.infer<typeof listDownloadsQuerySchema>;

export const createUploadsSchema = z.object({
  files: z
    .array(
      z.object({
        filename: z.string().min(1).max(255),
        contentType: z.string().regex(/^(audio|video)\//),
        sizeBytes: z
          .number()
          .int()
          .positive()
          .max(1024 ** 3),
      }),
    )
    .min(1)
    .max(500),
});
export type CreateUploadsRequest = z.infer<typeof createUploadsSchema>;

export const createUploadsResponseSchema = z.object({
  uploads: z.array(z.object({ key: z.string(), filename: z.string(), url: z.url() })),
  expiresAt: timestampSchema,
});
export type CreateUploadsResponse = z.infer<typeof createUploadsResponseSchema>;
