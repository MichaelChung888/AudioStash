import type { LrclibClient, LyricsQuery } from '@pluck/catalog';
import { lrcToPlain } from '@pluck/core';
import type { Logger } from '../lib/logger.ts';

export interface Lyrics {
  plain: string | null;
  // LRC format: each line starts with the time it is sung, e.g. "[00:28.88] ...".
  synced: string | null;
}

export function createLyricsLookup({ lrclib, logger }: { lrclib: LrclibClient; logger: Logger }) {
  return {
    // Never throws: a song without lyrics is still a song.
    async find(query: LyricsQuery): Promise<Lyrics | null> {
      try {
        const found = await lrclib.find(query);
        if (!found || found.instrumental) return null;
        const synced = found.syncedLyrics?.trim() || null;
        const plain = found.plainLyrics?.trim() || (synced ? lrcToPlain(synced) : '') || null;
        return plain || synced ? { plain, synced } : null;
      } catch (error) {
        logger.warn({ err: error, title: query.title, artist: query.artist }, 'lyrics lookup failed');
        return null;
      }
    },
  };
}

export type LyricsLookup = ReturnType<typeof createLyricsLookup>;
