import { z } from 'zod';
import { idSchema, timestampSchema } from './common.ts';
import { playlistEntrySchema, playlistSchema, songSchema } from './library.ts';

// ---------------------------------------------------------------------------
// Push: the phone records every library edit as a mutation in a local outbox,
// then sends them in order when it is online. Each mutation carries an id the
// phone generated, so sending the same batch twice applies it once.
// ---------------------------------------------------------------------------

const mutation = <T extends string, P extends z.ZodType>(type: T, payload: P) =>
  z.object({
    id: idSchema,
    type: z.literal(type),
    payload,
    createdAt: timestampSchema,
  });

const songMetadataPatch = z
  .object({
    title: z.string().min(1).max(300),
    artist: z.string().min(1).max(300),
    album: z.string().max(300).nullable(),
    year: z.number().int().min(1000).max(9999).nullable(),
    genre: z.string().max(100).nullable(),
  })
  .partial();

export const mutationSchema = z.discriminatedUnion('type', [
  mutation('playlist.create', z.object({ playlistId: idSchema, name: z.string().min(1).max(200), description: z.string().max(1000).optional() })),
  mutation(
    'playlist.update',
    z.object({ playlistId: idSchema, name: z.string().min(1).max(200).optional(), description: z.string().max(1000).nullable().optional() }),
  ),
  mutation('playlist.delete', z.object({ playlistId: idSchema })),
  mutation(
    'playlist.addSongs',
    z.object({
      playlistId: idSchema,
      entries: z
        .array(z.object({ entryId: idSchema, songId: idSchema, position: z.string().min(1) }))
        .min(1)
        .max(500),
    }),
  ),
  mutation('playlist.moveEntry', z.object({ entryId: idSchema, position: z.string().min(1) })),
  mutation('playlist.removeEntry', z.object({ entryId: idSchema })),
  mutation('song.update', z.object({ songId: idSchema, patch: songMetadataPatch })),
  mutation('song.delete', z.object({ songId: idSchema })),
  mutation('song.played', z.object({ songId: idSchema, playedAt: timestampSchema })),
]);
export type Mutation = z.infer<typeof mutationSchema>;
export type MutationType = Mutation['type'];

export const pushRequestSchema = z.object({
  mutations: z.array(mutationSchema).min(1).max(500),
});
export type PushRequest = z.infer<typeof pushRequestSchema>;

export const MUTATION_RESULTS = ['applied', 'duplicate', 'rejected'] as const;
export type MutationResultStatus = (typeof MUTATION_RESULTS)[number];

export const pushResponseSchema = z.object({
  results: z.array(
    z.object({
      id: idSchema,
      status: z.enum(MUTATION_RESULTS),
      reason: z.string().optional(),
    }),
  ),
});
export type PushResponse = z.infer<typeof pushResponseSchema>;

// ---------------------------------------------------------------------------
// Pull: every server-side write appends a row to an ordered change log. The
// phone stores the last sequence number it applied (the cursor) and asks for
// everything after it.
// ---------------------------------------------------------------------------

export const changeSchema = z.discriminatedUnion('type', [
  z.object({ seq: z.number().int(), type: z.literal('song.upserted'), data: songSchema }),
  z.object({ seq: z.number().int(), type: z.literal('song.deleted'), id: idSchema }),
  z.object({ seq: z.number().int(), type: z.literal('playlist.upserted'), data: playlistSchema }),
  z.object({ seq: z.number().int(), type: z.literal('playlist.deleted'), id: idSchema }),
  z.object({ seq: z.number().int(), type: z.literal('entry.upserted'), data: playlistEntrySchema }),
  z.object({ seq: z.number().int(), type: z.literal('entry.deleted'), id: idSchema }),
]);
export type Change = z.infer<typeof changeSchema>;

export const pullQuerySchema = z.object({
  cursor: z.coerce.number().int().nonnegative().default(0),
  limit: z.coerce.number().int().min(1).max(1000).default(500),
});
export type PullQuery = z.infer<typeof pullQuerySchema>;

export const pullResponseSchema = z.object({
  changes: z.array(changeSchema),
  cursor: z.number().int(),
  hasMore: z.boolean(),
});
export type PullResponse = z.infer<typeof pullResponseSchema>;
