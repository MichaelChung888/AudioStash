import { type AppleChartSong, type AppleChartsClient, appleArtwork, type DeezerClient, type DeezerTrack, type YoutubeClient } from '@audiostash/catalog';
import type { CatalogTrack, ForYouResponse, Genre, YoutubeVideo } from '@audiostash/contracts';
import { normalizeForMatch, parseIsoDuration, pickBestMatch, stripFeaturing, youtubeVideoUrl } from '@audiostash/core';
import type { Database } from '@audiostash/db';
import * as songsDb from '../db/songs.ts';
import { mapWithConcurrency } from '../lib/concurrency.ts';
import { AppError, UnavailableError } from '../lib/errors.ts';
import { TtlCache } from '../lib/ttl-cache.ts';

interface Deps {
  db: Database;
  deezer: DeezerClient;
  apple: AppleChartsClient;
  youtube: YoutubeClient | null;
}

type UnownedTrack = Omit<CatalogTrack, 'inLibrary'>;

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
// Deezer allows 50 requests per 5 seconds. Five at a time stays well inside that.
const DEEZER_CONCURRENCY = 5;

// Charts, search and recommendations from free public APIs. Responses are cached
// in memory, because the upstream data changes slowly and the APIs are rate limited.
// Whether a track is already in the library is worked out per request, after the cache.
export function createCatalogService({ db, deezer, apple, youtube }: Deps) {
  const caches = {
    genres: new TtlCache<Genre[]>({ ttlMs: 24 * HOUR }),
    charts: new TtlCache<UnownedTrack[]>({ ttlMs: 30 * MINUTE }),
    trending: new TtlCache<UnownedTrack[]>({ ttlMs: HOUR }),
    search: new TtlCache<UnownedTrack[]>({ ttlMs: 10 * MINUTE }),
    forYou: new TtlCache<{ title: string; reason: string; tracks: UnownedTrack[] }[]>({ ttlMs: HOUR }),
    youtube: new TtlCache<YoutubeVideo[]>({ ttlMs: HOUR }),
  };
  const nonEmpty = (list: readonly unknown[]) => list.length > 0;

  async function markOwned(tracks: readonly UnownedTrack[]): Promise<CatalogTrack[]> {
    const isrcs = await songsDb.isrcsInLibrary(
      db,
      tracks.flatMap((t) => (t.hint.isrc ? [t.hint.isrc] : [])),
    );
    // Chart results carry no ISRC, so tracks are also matched on title and artist.
    const owned = await songsDb.findByLowerTitles(db, [...new Set(tracks.map((t) => t.title.toLowerCase()))]);
    const ownedKeys = new Set(owned.flatMap((s) => [libraryKey(s.title, s.artist), ...(s.albumArtist ? [libraryKey(s.title, s.albumArtist)] : [])]));
    return tracks.map((t) => ({ ...t, inLibrary: (t.hint.isrc !== undefined && isrcs.has(t.hint.isrc)) || ownedKeys.has(libraryKey(t.title, t.artist)) }));
  }

  return {
    genres: () => upstream(() => caches.genres.get('all', async () => (await deezer.genres()).map(({ id, name }) => ({ id, name })), nonEmpty)),

    async charts(genreId: number, limit: number): Promise<CatalogTrack[]> {
      const tracks = await upstream(() => caches.charts.get(`${genreId}:${limit}`, async () => (await deezer.chart(genreId, limit)).map(fromDeezer), nonEmpty));
      return markOwned(tracks);
    },

    // Apple's most-played chart, matched to Deezer for previews, covers and ISRCs.
    async trending(country: string, limit: number): Promise<CatalogTrack[]> {
      const tracks = await upstream(() =>
        caches.trending.get(
          `${country}:${limit}`,
          async () => {
            const songs = await apple.mostPlayedSongs(country, limit);
            return mapWithConcurrency(songs, DEEZER_CONCURRENCY, async (song) => (await matchOnDeezer(deezer, song)) ?? fromApple(song));
          },
          nonEmpty,
        ),
      );
      return markOwned(tracks);
    },

    async search(query: string, limit: number): Promise<CatalogTrack[]> {
      const tracks = await upstream(() =>
        caches.search.get(`${query.toLowerCase()}:${limit}`, async () => (await deezer.searchTracks(query, limit)).map(fromDeezer)),
      );
      return markOwned(tracks);
    },

    // "Because you like X": top tracks of artists related to the library's most played artists.
    async forYou(): Promise<ForYouResponse> {
      const top = await songsDb.topArtists(db, 3);
      if (top.length === 0) return { sections: [] };

      const sections = await upstream(() =>
        caches.forYou.get(top.map((a) => a.artist.toLowerCase()).join('|'), async () => {
          const built = await mapWithConcurrency(top, 1, async ({ artist }) => {
            const found = await deezer.searchArtist(artist);
            if (!found) return null;
            const related = await deezer.relatedArtists(found.id, 8);
            const tracks = (await mapWithConcurrency(related, DEEZER_CONCURRENCY, (r) => deezer.artistTopTracks(r.id, 2))).flat();
            return { title: `Because you like ${artist}`, reason: `Popular songs from artists similar to ${artist}`, tracks: tracks.map(fromDeezer) };
          });
          return built.filter((section) => section !== null);
        }),
      );

      const marked = await Promise.all(
        sections.map(async (section) => ({ ...section, tracks: (await markOwned(section.tracks)).filter((t) => !t.inLibrary) })),
      );
      return { sections: marked.filter((section) => section.tracks.length > 0) };
    },

    async youtube(query: string, limit: number): Promise<YoutubeVideo[]> {
      if (!youtube) throw new UnavailableError('YouTube search is not set up on the server (YOUTUBE_API_KEY)');
      return upstream(() =>
        caches.youtube.get(`${query.toLowerCase()}:${limit}`, async () =>
          (await youtube.searchVideos(query, limit)).map((video) => ({
            videoId: video.videoId,
            url: youtubeVideoUrl(video.videoId),
            title: video.title,
            channel: video.channel,
            durationSec: video.duration ? parseIsoDuration(video.duration) : null,
            thumbnailUrl: video.thumbnailUrl,
          })),
        ),
      );
    },
  };
}

export type CatalogService = ReturnType<typeof createCatalogService>;

// Third-party failures become 503s with a readable message instead of 500s.
async function upstream<T>(load: () => Promise<T>): Promise<T> {
  try {
    return await load();
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new UnavailableError('The music catalog is not reachable right now. Try again later.');
  }
}

function libraryKey(title: string, artist: string): string {
  return `${normalizeForMatch(title)}|${normalizeForMatch(stripFeaturing(artist))}`;
}

function fromDeezer(track: DeezerTrack): UnownedTrack {
  const durationSec = track.duration > 0 ? track.duration : null;
  const coverUrl = track.album.cover_xl ?? null;
  return {
    id: `deezer:${track.id}`,
    title: track.title,
    artist: track.artist.name,
    album: track.album.title,
    durationSec,
    coverUrl,
    previewUrl: track.preview || null,
    explicit: track.explicit_lyrics ?? false,
    hint: {
      title: track.title,
      artist: track.artist.name,
      album: track.album.title,
      durationSec: durationSec ?? undefined,
      isrc: track.isrc,
      deezerId: track.id,
      coverUrl: coverUrl ?? undefined,
    },
  };
}

function fromApple(song: AppleChartSong): UnownedTrack {
  const coverUrl = appleArtwork(song.artworkUrl100);
  return {
    id: `apple:${song.id}`,
    title: song.name,
    artist: song.artistName,
    album: null,
    durationSec: null,
    coverUrl,
    previewUrl: null,
    explicit: false,
    hint: { title: song.name, artist: song.artistName, coverUrl: coverUrl ?? undefined },
  };
}

async function matchOnDeezer(deezer: DeezerClient, song: AppleChartSong): Promise<UnownedTrack | null> {
  try {
    const results = await deezer.searchTracks(`${song.artistName} ${song.name}`, 5);
    const best = pickBestMatch(
      { title: song.name, artist: song.artistName },
      results.map((t) => ({ id: String(t.id), title: t.title, channel: t.artist.name, durationSec: t.duration })),
    );
    const match = best && results.find((t) => String(t.id) === best.id);
    return match ? fromDeezer(match) : null;
  } catch {
    return null;
  }
}
