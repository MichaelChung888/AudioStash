import { z } from 'zod';
import { getJson, HttpError, type HttpOptions } from './http.ts';

// YouTube Data API v3. Needs a free API key from Google Cloud. The daily quota is
// 10,000 units and one search costs 100, so results should be cached.
const BASE_URL = 'https://www.googleapis.com/youtube/v3';
const MUSIC_CATEGORY_ID = '10';

const searchSchema = z.object({
  items: z.array(
    z.object({
      id: z.object({ videoId: z.string() }),
      snippet: z.object({
        title: z.string(),
        channelTitle: z.string(),
        thumbnails: z.record(z.string(), z.object({ url: z.string() })).optional(),
      }),
    }),
  ),
});

const videosSchema = z.object({
  items: z.array(z.object({ id: z.string(), contentDetails: z.object({ duration: z.string() }) })),
});

export interface YoutubeSearchResult {
  videoId: string;
  title: string;
  channel: string;
  // ISO 8601, e.g. "PT3M25S".
  duration: string | null;
  thumbnailUrl: string | null;
}

export function createYoutubeClient(options: HttpOptions & { apiKey: string }) {
  async function get<S extends z.ZodType>(resource: string, params: Record<string, string>, schema: S): Promise<z.infer<S>> {
    const query = new URLSearchParams({ ...params, key: options.apiKey });
    try {
      return await getJson(`${BASE_URL}/${resource}?${query}`, schema, options);
    } catch (error) {
      // Rethrow without the query string, which contains the API key.
      if (error instanceof HttpError) throw new HttpError(error.status, `${BASE_URL}/${resource}`);
      throw error;
    }
  }

  return {
    async searchVideos(query: string, limit: number): Promise<YoutubeSearchResult[]> {
      const search = await get(
        'search',
        { part: 'snippet', type: 'video', videoCategoryId: MUSIC_CATEGORY_ID, maxResults: String(limit), q: query },
        searchSchema,
      );
      const ids = search.items.map((item) => item.id.videoId);
      if (ids.length === 0) return [];

      // Search results have no duration; videos.list does, for 1 quota unit.
      const details = await get('videos', { part: 'contentDetails', id: ids.join(',') }, videosSchema);
      const durations = new Map(details.items.map((v) => [v.id, v.contentDetails.duration]));

      return search.items.map(({ id, snippet }) => ({
        videoId: id.videoId,
        title: decodeEntities(snippet.title),
        channel: decodeEntities(snippet.channelTitle),
        duration: durations.get(id.videoId) ?? null,
        thumbnailUrl: snippet.thumbnails?.high?.url ?? snippet.thumbnails?.default?.url ?? null,
      }));
    },
  };
}

export type YoutubeClient = ReturnType<typeof createYoutubeClient>;

const ENTITIES: Record<string, string> = { '&amp;': '&', '&quot;': '"', '&#39;': "'", '&lt;': '<', '&gt;': '>' };

// The search endpoint returns titles HTML-escaped ("Rock &amp; Roll").
function decodeEntities(text: string): string {
  return text.replace(/&(?:amp|quot|#39|lt|gt);/g, (entity) => ENTITIES[entity] ?? entity);
}
