import { z } from 'zod';
import { getJson, type HttpOptions } from './http.ts';

// Apple's public marketing feeds. No key. Updated daily.
const BASE_URL = 'https://rss.marketingtools.apple.com/api/v2';

const songSchema = z.object({
  id: z.string(),
  name: z.string(),
  artistName: z.string(),
  releaseDate: z.string().optional(),
  artworkUrl100: z.string().optional(),
  url: z.string().optional(),
  genres: z.array(z.object({ name: z.string() })).optional(),
});
export type AppleChartSong = z.infer<typeof songSchema>;

const feedSchema = z.object({ feed: z.object({ results: z.array(songSchema) }) });

export function createAppleChartsClient(options: HttpOptions) {
  return {
    mostPlayedSongs: async (country: string, limit: number) =>
      (await getJson(`${BASE_URL}/${encodeURIComponent(country)}/music/most-played/${limit}/songs.json`, feedSchema, options)).feed.results,
  };
}

export type AppleChartsClient = ReturnType<typeof createAppleChartsClient>;

// Feed artwork is 100x100. The CDN serves any size if the size in the URL changes.
export function appleArtwork(url: string | undefined, size = 600): string | null {
  return url ? url.replace(/\/\d+x\d+bb\./, `/${size}x${size}bb.`) : null;
}
