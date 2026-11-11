import { fileURLToPath } from 'node:url';
import type { AudioCodec } from '@pluck/contracts';
import { run } from '../lib/process.ts';

const SCRIPT = fileURLToPath(new URL('../../scripts/tag.py', import.meta.url));

export interface FileTags {
  title: string;
  artist: string;
  album: string | null;
  albumArtist: string | null;
  year: number | null;
  genre: string | null;
  trackNumber: number | null;
  discNumber: number | null;
  isrc: string | null;
}

export interface TagJob {
  path: string;
  codec: AudioCodec;
  tags: FileTags;
  lyrics: { plain: string | null; synced: string | null } | null;
  loudnessLufs: number | null;
  // A JPEG file to embed as the front cover.
  cover: string | null;
}

// Tags are written into the file as well as stored in the database, so the songs
// keep their details when copied to another player or computer.
export function createTagger(options: { pythonPath: string }) {
  return {
    async write(job: TagJob): Promise<void> {
      await run(options.pythonPath, [SCRIPT], { input: JSON.stringify(job), timeoutMs: 60_000 });
    },

    async version(): Promise<string> {
      const { stdout } = await run(options.pythonPath, ['-c', 'import mutagen; print(mutagen.version_string)'], { timeoutMs: 30_000 });
      return stdout.trim();
    },
  };
}

export type Tagger = ReturnType<typeof createTagger>;
