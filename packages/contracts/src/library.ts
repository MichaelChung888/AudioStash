import { z } from 'zod';
import { idSchema, timestampSchema } from './common.ts';

export const SONG_SOURCES = ['youtube', 'soundcloud', 'bandcamp', 'upload', 'other'] as const;
export type SongSource = (typeof SONG_SOURCES)[number];

export const AUDIO_CODECS = ['opus', 'aac', 'mp3'] as const;
export type AudioCodec = (typeof AUDIO_CODECS)[number];

export const AUDIO_EXTENSIONS: Record<AudioCodec, string> = { opus: 'opus', aac: 'm4a', mp3: 'mp3' };
export const AUDIO_CONTENT_TYPES: Record<AudioCodec, string> = { opus: 'audio/ogg', aac: 'audio/mp4', mp3: 'audio/mpeg' };

export const songSchema = z.object({
  id: idSchema,
  title: z.string(),
  artist: z.string(),
  album: z.string().nullable(),
  albumArtist: z.string().nullable(),
  year: z.number().int().nullable(),
  genre: z.string().nullable(),
  trackNumber: z.number().int().nullable(),
  discNumber: z.number().int().nullable(),
  isrc: z.string().nullable(),
  durationMs: z.number().int().nonnegative(),
  source: z.enum(SONG_SOURCES),
  sourceUrl: z.string().nullable(),
  audio: z.object({
    codec: z.enum(AUDIO_CODECS),
    bitrateKbps: z.number().int().nullable(),
    sizeBytes: z.number().int().nonnegative(),
    sha256: z.string(),
  }),
  coverColor: z.string().nullable(),
  hasCover: z.boolean(),
  lyrics: z
    .object({
      plain: z.string().nullable(),
      synced: z.string().nullable(),
    })
    .nullable(),
  loudness: z
    .object({
      lufs: z.number(),
      gainDb: z.number(),
    })
    .nullable(),
  // Relative to the library root on the phone, e.g. "Songs/Dua Lipa/Houdini.opus".
  path: z.string(),
  playCount: z.number().int().nonnegative(),
  lastPlayedAt: timestampSchema.nullable(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});
export type Song = z.infer<typeof songSchema>;

export const playlistSchema = z.object({
  id: idSchema,
  name: z.string(),
  description: z.string().nullable(),
  sourceUrl: z.string().nullable(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});
export type Playlist = z.infer<typeof playlistSchema>;

// One song's place in one playlist. `position` is a fractional index key: sorting
// the keys as plain strings gives the playlist order.
export const playlistEntrySchema = z.object({
  id: idSchema,
  playlistId: idSchema,
  songId: idSchema,
  position: z.string(),
  addedAt: timestampSchema,
});
export type PlaylistEntry = z.infer<typeof playlistEntrySchema>;

export const fileUrlsRequestSchema = z.object({
  songIds: z.array(idSchema).min(1).max(200),
});
export type FileUrlsRequest = z.infer<typeof fileUrlsRequestSchema>;

export const fileUrlsResponseSchema = z.object({
  files: z.array(
    z.object({
      songId: idSchema,
      audioUrl: z.url(),
      coverUrl: z.url().nullable(),
    }),
  ),
  expiresAt: timestampSchema,
});
export type FileUrlsResponse = z.infer<typeof fileUrlsResponseSchema>;
