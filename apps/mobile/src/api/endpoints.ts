import {
  type CreateDownloadRequest,
  type CreateUploadsRequest,
  createUploadsResponseSchema,
  downloadDetailSchema,
  downloadSchema,
  fileUrlsResponseSchema,
  forYouResponseSchema,
  genreSchema,
  type Mutation,
  previewResponseSchema,
  pullResponseSchema,
  pushResponseSchema,
  sessionSchema,
  statusResponseSchema,
  tracksResponseSchema,
  youtubeVideoSchema,
} from '@audiostash/contracts';
import { z } from 'zod';
import { query, request } from './client.ts';

const genresResponse = z.object({ genres: z.array(genreSchema) });
const videosResponse = z.object({ videos: z.array(youtubeVideoSchema) });
const downloadsResponse = z.object({ downloads: z.array(downloadSchema) });
const sessionsResponse = z.object({ sessions: z.array(sessionSchema) });

export const api = {
  status: () => request('/v1/status', { schema: statusResponseSchema }),

  genres: () => request('/v1/catalog/genres', { schema: genresResponse }).then((r) => r.genres),
  charts: (genreId: number) => request(`/v1/catalog/charts${query({ genreId, limit: 50 })}`, { schema: tracksResponseSchema }).then((r) => r.tracks),
  trending: (country: string) => request(`/v1/catalog/trending${query({ country, limit: 20 })}`, { schema: tracksResponseSchema }).then((r) => r.tracks),
  forYou: () => request('/v1/catalog/for-you', { schema: forYouResponseSchema }).then((r) => r.sections),
  searchSongs: (q: string) => request(`/v1/catalog/search${query({ q })}`, { schema: tracksResponseSchema }).then((r) => r.tracks),
  searchYoutube: (q: string) => request(`/v1/catalog/youtube${query({ q })}`, { schema: videosResponse }).then((r) => r.videos),
  previewUrl: (deezerId: number) => request(`/v1/catalog/preview/${deezerId}`, { schema: previewResponseSchema }).then((r) => r.url),

  downloads: (status: 'open' | 'finished') => request(`/v1/downloads${query({ status, limit: 50 })}`, { schema: downloadsResponse }).then((r) => r.downloads),
  download: (id: string) => request(`/v1/downloads/${id}`, { schema: downloadDetailSchema }),
  createDownload: (body: CreateDownloadRequest) => request('/v1/downloads', { method: 'POST', body, schema: downloadDetailSchema }),
  cancelDownload: (id: string) => request<unknown>(`/v1/downloads/${id}/cancel`, { method: 'POST' }),
  retryDownload: (id: string) => request<unknown>(`/v1/downloads/${id}/retry`, { method: 'POST' }),
  removeDownload: (id: string) => request(`/v1/downloads/${id}`, { method: 'DELETE' }),
  createUploads: (body: CreateUploadsRequest) => request('/v1/uploads', { method: 'POST', body, schema: createUploadsResponseSchema }),

  push: (mutations: Mutation[]) => request('/v1/sync/push', { method: 'POST', body: { mutations }, schema: pushResponseSchema }),
  pull: (cursor: number) => request(`/v1/sync/pull${query({ cursor, limit: 500 })}`, { schema: pullResponseSchema }),
  fileUrls: (songIds: string[]) => request('/v1/songs/file-urls', { method: 'POST', body: { songIds }, schema: fileUrlsResponseSchema }),

  sessions: () => request('/v1/sessions', { schema: sessionsResponse }).then((r) => r.sessions),
  revokeSession: (id: string) => request(`/v1/sessions/${id}`, { method: 'DELETE' }),
};
