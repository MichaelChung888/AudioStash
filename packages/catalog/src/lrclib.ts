import { z } from 'zod';
import { getJson, HttpError, type HttpOptions } from './http.ts';

// LRCLIB: free, community-run lyrics database. Asks clients to send a User-Agent naming the app.
const BASE_URL = 'https://lrclib.net/api';

const lyricsSchema = z.object({
  id: z.number(),
  trackName: z.string(),
  artistName: z.string(),
  duration: z.number().nullish(),
  instrumental: z.boolean(),
  plainLyrics: z.string().nullable(),
  syncedLyrics: z.string().nullable(),
});
export type LrclibLyrics = z.infer<typeof lyricsSchema>;

export interface LyricsQuery {
  title: string;
  artist: string;
  album?: string | null;
  durationSec?: number | null;
}

export function createLrclibClient(options: HttpOptions) {
  return {
    // Exact lookup first: LRCLIB matches on title, artist, album and duration (within 2 seconds).
    // Falls back to a search and keeps the first result whose length is within 5 seconds.
    async find(query: LyricsQuery): Promise<LrclibLyrics | null> {
      const params = new URLSearchParams({ track_name: query.title, artist_name: query.artist });
      if (query.album) params.set('album_name', query.album);
      if (query.durationSec) params.set('duration', String(Math.round(query.durationSec)));

      try {
        return await getJson(`${BASE_URL}/get?${params}`, lyricsSchema, options);
      } catch (error) {
        if (!(error instanceof HttpError && error.status === 404)) throw error;
      }

      const search = new URLSearchParams({ track_name: query.title, artist_name: query.artist });
      const results = await getJson(`${BASE_URL}/search?${search}`, z.array(lyricsSchema), options);
      return (
        results.find((r) => (r.syncedLyrics || r.plainLyrics) && (!query.durationSec || !r.duration || Math.abs(r.duration - query.durationSec) <= 5)) ?? null
      );
    },
  };
}

export type LrclibClient = ReturnType<typeof createLrclibClient>;
