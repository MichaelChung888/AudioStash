import { z } from 'zod';
import { trackHintSchema } from './downloads.ts';

export const genreSchema = z.object({
  id: z.number().int(),
  name: z.string(),
});
export type Genre = z.infer<typeof genreSchema>;

export const catalogTrackSchema = z.object({
  // Prefixed with the provider so ids from different providers never collide, e.g. "deezer:3135556".
  id: z.string(),
  title: z.string(),
  artist: z.string(),
  album: z.string().nullable(),
  durationSec: z.number().int().nullable(),
  coverUrl: z.string().nullable(),
  previewDeezerId: z.number().int().positive().nullable(),
  explicit: z.boolean(),
  inLibrary: z.boolean(),
  // Pass this straight to POST /v1/downloads as a catalog source.
  hint: trackHintSchema,
});
export type CatalogTrack = z.infer<typeof catalogTrackSchema>;

// Artists come from Deezer only.
export const catalogArtistSchema = z.object({
  deezerId: z.number().int().positive(),
  name: z.string(),
  pictureUrl: z.string().nullable(),
});
export type CatalogArtist = z.infer<typeof catalogArtistSchema>;

export const artistsResponseSchema = z.object({ artists: z.array(catalogArtistSchema) });

export const artistResponseSchema = z.object({
  artist: catalogArtistSchema.extend({ fans: z.number().int().nonnegative().nullable() }),
  topTracks: z.array(catalogTrackSchema),
  related: z.array(catalogArtistSchema),
});
export type ArtistResponse = z.infer<typeof artistResponseSchema>;

export const artistParamSchema = z.object({ deezerId: z.coerce.number().int().positive() });

export const limitQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const chartsQuerySchema = z.object({
  genreId: z.coerce.number().int().nonnegative().default(0),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const trendingQuerySchema = z.object({
  country: z
    .string()
    .regex(/^[a-z]{2}$/)
    .default('gb'),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const searchQuerySchema = z.object({
  q: z.string().trim().min(1).max(200),
  limit: z.coerce.number().int().min(1).max(50).default(25),
});

export const previewParamSchema = z.object({ deezerId: z.coerce.number().int().positive() });
export const previewResponseSchema = z.object({ url: z.url() });

export const tracksResponseSchema = z.object({ tracks: z.array(catalogTrackSchema) });
export type TracksResponse = z.infer<typeof tracksResponseSchema>;

export const forYouResponseSchema = z.object({
  sections: z.array(
    z.object({
      title: z.string(),
      reason: z.string(),
      tracks: z.array(catalogTrackSchema),
    }),
  ),
});
export type ForYouResponse = z.infer<typeof forYouResponseSchema>;

export const youtubeVideoSchema = z.object({
  videoId: z.string(),
  url: z.url(),
  title: z.string(),
  channel: z.string(),
  durationSec: z.number().int().nullable(),
  thumbnailUrl: z.string().nullable(),
});
export type YoutubeVideo = z.infer<typeof youtubeVideoSchema>;
