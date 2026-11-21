import { type ClientEvent, type Download, type DownloadDetail, FINISHED_DOWNLOAD_STATUSES, type StatusResponse } from '@audiostash/contracts';
import { type QueryClient, useQuery } from '@tanstack/react-query';
import { config } from '../config.ts';
import { getLibraryTotals, getPlaylist, getPlaylistItems, listPlaylists, listSongs } from '../db/library.ts';
import { getDefaultDownloadOptions, getMobileDataAllowed } from '../db/settings.ts';
import { requestedDownload } from '../downloads/requested.ts';
import { getLibraryFolder } from '../files/library-folder.ts';
import { requestSync } from '../sync/engine.ts';
import { api } from './endpoints.ts';

// Everything under ['local'] reads the phone's database and is refreshed when it
// changes (see onLibraryChanged in the root layout). The rest comes from the server.
export const keys = {
  status: ['status'] as const,
  catalog: ['catalog'] as const,
  genres: ['catalog', 'genres'] as const,
  charts: (genreId: number) => ['catalog', 'charts', genreId] as const,
  trending: ['catalog', 'trending', config.chartCountry] as const,
  forYou: ['catalog', 'forYou'] as const,
  searchSongs: (q: string) => ['catalog', 'search', q] as const,
  searchYoutube: (q: string) => ['catalog', 'youtube', q] as const,
  searchArtists: (q: string) => ['catalog', 'searchArtists', q] as const,
  topArtists: ['catalog', 'topArtists'] as const,
  artist: (deezerId: number) => ['catalog', 'artist', deezerId] as const,
  downloads: (status: 'open' | 'finished') => ['downloads', status] as const,
  download: (id: string) => ['download', id] as const,
  sessions: ['sessions'] as const,
  local: ['local'] as const,
  songs: ['local', 'songs'] as const,
  playlists: ['local', 'playlists'] as const,
  playlist: (id: string) => ['local', 'playlist', id] as const,
  totals: ['local', 'totals'] as const,
  folder: ['local', 'folder'] as const,
  downloadOptions: ['local', 'downloadOptions'] as const,
  mobileData: ['local', 'mobileData'] as const,
};

const MINUTE = 60_000;

export const useStatus = () => useQuery({ queryKey: keys.status, queryFn: api.status, refetchInterval: MINUTE });

export const useGenres = () => useQuery({ queryKey: keys.genres, queryFn: api.genres, staleTime: 24 * 60 * MINUTE });
export const useCharts = (genreId: number) => useQuery({ queryKey: keys.charts(genreId), queryFn: () => api.charts(genreId), staleTime: 30 * MINUTE });
export const useTrending = () => useQuery({ queryKey: keys.trending, queryFn: () => api.trending(config.chartCountry), staleTime: 30 * MINUTE });
export const useForYou = () => useQuery({ queryKey: keys.forYou, queryFn: api.forYou, staleTime: 30 * MINUTE });

export const useSearchSongs = (q: string, enabled: boolean) =>
  useQuery({ queryKey: keys.searchSongs(q), queryFn: () => api.searchSongs(q), enabled: enabled && q.length > 0, staleTime: 10 * MINUTE });
export const useSearchYoutube = (q: string, enabled: boolean) =>
  useQuery({ queryKey: keys.searchYoutube(q), queryFn: () => api.searchYoutube(q), enabled: enabled && q.length > 0, staleTime: 10 * MINUTE });

export const useSearchArtists = (q: string) =>
  useQuery({ queryKey: keys.searchArtists(q), queryFn: () => api.searchArtists(q), enabled: q.length > 0, staleTime: 10 * MINUTE });

export const useTopArtists = () => useQuery({ queryKey: keys.topArtists, queryFn: api.topArtists, staleTime: 30 * MINUTE });
export const useArtist = (deezerId: number) => useQuery({ queryKey: keys.artist(deezerId), queryFn: () => api.artist(deezerId), staleTime: 30 * MINUTE });

export const useDownloads = (status: 'open' | 'finished') => useQuery({ queryKey: keys.downloads(status), queryFn: () => api.downloads(status) });

export const useDownloading = (trackId: string): boolean =>
  useQuery({
    queryKey: keys.downloads('open'),
    queryFn: () => api.downloads('open'),
    select: (open) => open.some((download) => download.id === requestedDownload(trackId)),
  }).data ?? false;
export const useDownload = (id: string, enabled = true) => useQuery({ queryKey: keys.download(id), queryFn: () => api.download(id), enabled });

export const useSessions = () => useQuery({ queryKey: keys.sessions, queryFn: api.sessions });

export const useSongs = () => useQuery({ queryKey: keys.songs, queryFn: listSongs });
export const usePlaylists = () => useQuery({ queryKey: keys.playlists, queryFn: listPlaylists });
export const useLibraryTotals = () => useQuery({ queryKey: keys.totals, queryFn: getLibraryTotals });
export const useLibraryFolder = () => useQuery({ queryKey: keys.folder, queryFn: getLibraryFolder });
export const useDefaultDownloadOptions = () => useQuery({ queryKey: keys.downloadOptions, queryFn: getDefaultDownloadOptions });
export const useMobileDataAllowed = () => useQuery({ queryKey: keys.mobileData, queryFn: getMobileDataAllowed });
export const usePlaylist = (id: string) =>
  useQuery({
    queryKey: keys.playlist(id),
    queryFn: async () => {
      const [playlist, items] = await Promise.all([getPlaylist(id), getPlaylistItems(id)]);
      return { playlist, items };
    },
  });

// Live events patch the cached server data, so screens update without refetching.
export function applyEvent(client: QueryClient, event: ClientEvent): void {
  switch (event.type) {
    case 'download.updated':
      putDownload(client, event.download);
      break;
    case 'download.item.updated':
      client.setQueryData<DownloadDetail>(keys.download(event.item.downloadId), (detail) =>
        detail ? { ...detail, items: detail.items.map((item) => (item.id === event.item.id ? event.item : item)) } : detail,
      );
      break;
    case 'download.item.progress':
      client.setQueryData<DownloadDetail>(keys.download(event.downloadId), (detail) =>
        detail
          ? {
              ...detail,
              items: detail.items.map((item) =>
                item.id === event.itemId ? { ...item, status: 'active', stage: event.stage, progress: event.progress } : item,
              ),
            }
          : detail,
      );
      break;
    case 'library.changed':
      void requestSync();
      // "In your library" marks on chart and search rows may have changed.
      void client.invalidateQueries({ queryKey: keys.catalog });
      break;
    case 'worker.status':
      client.setQueryData<StatusResponse>(keys.status, (status) =>
        status ? { ...status, worker: { ...status.worker, online: event.online, lastSeenAt: event.lastSeenAt } } : status,
      );
      break;
  }
}

// Moves a download between the open and finished lists as its status changes.
export function putDownload(client: QueryClient, download: Download): void {
  const finished = FINISHED_DOWNLOAD_STATUSES.includes(download.status);
  const without = (list: Download[] | undefined) => list?.filter((item) => item.id !== download.id);
  client.setQueryData<Download[]>(keys.downloads('open'), (list) => (finished ? without(list) : upsert(list, download)));
  client.setQueryData<Download[]>(keys.downloads('finished'), (list) => (finished ? upsert(list, download) : without(list)));
  client.setQueryData<DownloadDetail>(keys.download(download.id), (detail) => (detail ? { ...detail, ...download } : detail));
}

function upsert(list: Download[] | undefined, download: Download): Download[] | undefined {
  if (!list) return list;
  return list.some((item) => item.id === download.id) ? list.map((item) => (item.id === download.id ? download : item)) : [download, ...list];
}
