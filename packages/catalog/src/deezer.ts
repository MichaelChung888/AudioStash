import { z } from 'zod';
import { backoff, getJson, type HttpOptions } from './http.ts';

// Deezer's public API needs no key. Limit: 50 requests per 5 seconds per IP.
// Errors come back as HTTP 200 with an `error` object, so every response is checked for one.
const BASE_URL = 'https://api.deezer.com';
const QUOTA_EXCEEDED = 4;
const NOT_FOUND = 800;

const deezerErrorSchema = z.object({ error: z.object({ type: z.string(), message: z.string(), code: z.number() }) });

export class DeezerError extends Error {
  override name = 'DeezerError';
  readonly code: number;
  constructor(code: number, message: string) {
    super(`Deezer error ${code}: ${message}`);
    this.code = code;
  }
}

const artistSchema = z.object({
  id: z.number(),
  name: z.string(),
  picture_xl: z.string().nullish(),
});
export type DeezerArtist = z.infer<typeof artistSchema>;

const artistDetailSchema = artistSchema.extend({ nb_fan: z.number().optional() });

const trackSchema = z.object({
  id: z.number(),
  title: z.string(),
  title_short: z.string().optional(),
  duration: z.number(),
  rank: z.number().optional(),
  isrc: z.string().optional(),
  explicit_lyrics: z.boolean().optional(),
  preview: z.string().nullish(),
  artist: artistSchema,
  album: z.object({
    id: z.number(),
    title: z.string(),
    cover_xl: z.string().nullish(),
  }),
});
export type DeezerTrack = z.infer<typeof trackSchema>;

const trackDetailSchema = trackSchema.extend({
  isrc: z.string().nullish(),
  track_position: z.number().nullish(),
  disk_number: z.number().nullish(),
  release_date: z.string().nullish(),
  contributors: z.array(artistSchema).optional(),
});
export type DeezerTrackDetail = z.infer<typeof trackDetailSchema>;

const albumSchema = z.object({
  id: z.number(),
  title: z.string(),
  release_date: z.string().nullish(),
  artist: artistSchema,
  genres: z.object({ data: z.array(z.object({ id: z.number(), name: z.string() })) }).optional(),
});
export type DeezerAlbum = z.infer<typeof albumSchema>;

const genreSchema = z.object({ id: z.number(), name: z.string() });

const list = <T extends z.ZodType>(item: T) => z.object({ data: z.array(item), total: z.number().optional() });

export function createDeezerClient(options: HttpOptions) {
  async function get<S extends z.ZodType>(path: string, schema: S, attempt = 0): Promise<z.infer<S>> {
    const body = await getJson(`${BASE_URL}${path}`, z.unknown(), options);
    const error = deezerErrorSchema.safeParse(body);
    if (error.success) {
      const { code, message } = error.data.error;
      if (code === QUOTA_EXCEEDED && attempt < 3) {
        await backoff(attempt + 2);
        return get(path, schema, attempt + 1);
      }
      throw new DeezerError(code, message);
    }
    return schema.parse(body);
  }

  async function getOrNull<S extends z.ZodType>(path: string, schema: S): Promise<z.infer<S> | null> {
    try {
      return await get(path, schema);
    } catch (error) {
      if (error instanceof DeezerError && error.code === NOT_FOUND) return null;
      throw error;
    }
  }

  const searchArtists = async (query: string, limit: number) =>
    (await get(`/search/artist?q=${encodeURIComponent(query)}&limit=${limit}`, list(artistSchema))).data;

  return {
    // Genre ids that /chart accepts. 0 means all genres.
    genres: async () => (await get('/genre', list(genreSchema))).data,
    chart: async (genreId: number, limit: number) => (await get(`/chart/${genreId}/tracks?limit=${limit}`, list(trackSchema))).data,
    chartArtists: async (genreId: number, limit: number) => (await get(`/chart/${genreId}/artists?limit=${limit}`, list(artistSchema))).data,
    searchTracks: async (query: string, limit: number) => (await get(`/search?q=${encodeURIComponent(query)}&limit=${limit}`, list(trackSchema))).data,
    searchArtists,
    searchArtist: async (name: string) => (await searchArtists(name, 1))[0] ?? null,
    artist: (id: number) => getOrNull(`/artist/${id}`, artistDetailSchema),
    track: (id: number) => getOrNull(`/track/${id}`, trackDetailSchema),
    // ISRC: the international code that identifies one recording, shared by every store.
    trackByIsrc: (isrc: string) => getOrNull(`/track/isrc:${encodeURIComponent(isrc)}`, trackDetailSchema),
    album: (id: number) => getOrNull(`/album/${id}`, albumSchema),
    relatedArtists: async (artistId: number, limit: number) => (await get(`/artist/${artistId}/related?limit=${limit}`, list(artistSchema))).data,
    artistTopTracks: async (artistId: number, limit: number) => (await get(`/artist/${artistId}/top?limit=${limit}`, list(trackSchema))).data,
  };
}

export type DeezerClient = ReturnType<typeof createDeezerClient>;

// Deezer gives an artist or album without a picture a URL with an empty image id,
// which serves a stock grey image. Return null and show our own placeholder instead.
export function deezerImage(url: string | null | undefined): string | null {
  return url && !/\/images\/\w+\/\//.test(url) ? url : null;
}
