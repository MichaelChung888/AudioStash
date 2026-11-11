import { z } from 'zod';
import { run } from '../lib/process.ts';
import type { EncodePlan } from '../pipeline/format.ts';

export interface AudioProbe {
  codec: string;
  durationMs: number;
  bitrateKbps: number | null;
  // An embedded cover image, common in uploaded MP3 and M4A files.
  hasPicture: boolean;
  // Lowercased tag names: title, artist, album, album_artist, date, genre, track, disc.
  tags: Record<string, string>;
}

const probeSchema = z.object({
  streams: z.array(
    z.object({
      codec_type: z.string(),
      codec_name: z.string().optional(),
      bit_rate: z.string().optional(),
      disposition: z.object({ attached_pic: z.number().optional() }).optional(),
      tags: z.record(z.string(), z.string()).optional(),
    }),
  ),
  format: z.object({
    duration: z.string().optional(),
    bit_rate: z.string().optional(),
    tags: z.record(z.string(), z.string()).optional(),
  }),
});

export function createFfmpeg(options: { ffmpegPath: string; ffprobePath: string }) {
  const ffmpeg = (args: string[], timeoutMs = 10 * 60_000) => run(options.ffmpegPath, ['-hide_banner', '-nostdin', ...args], { timeoutMs });

  return {
    // ffmpeg and ffprobe ship together, but they are configured separately, so both are checked.
    async version(): Promise<string> {
      const [ffmpegOut, ffprobeOut] = await Promise.all([
        run(options.ffmpegPath, ['-version'], { timeoutMs: 30_000 }),
        run(options.ffprobePath, ['-version'], { timeoutMs: 30_000 }),
      ]);
      return [ffmpegOut.stdout, ffprobeOut.stdout].map((out) => out.split('\n')[0]?.trim()).join(', ');
    },

    async probe(file: string): Promise<AudioProbe> {
      const { stdout } = await run(options.ffprobePath, ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file], { timeoutMs: 60_000 });
      return parseProbe(JSON.parse(stdout));
    },

    // Keeps the first audio stream only. Source tags are dropped; the tagger writes clean ones.
    async convert(input: string, output: string, plan: EncodePlan): Promise<void> {
      await ffmpeg([
        '-y',
        '-i',
        input,
        '-map',
        '0:a:0',
        '-vn',
        '-map_metadata',
        '-1',
        '-map_chapters',
        '-1',
        ...plan.args,
        // Moves the index to the start of an M4A file, so playback can start before the whole file is read.
        ...(plan.codec === 'aac' ? ['-movflags', '+faststart'] : []),
        output,
      ]);
    },

    // EBU R128 integrated loudness of the whole song, in LUFS. Null for silence.
    async measureLoudness(file: string): Promise<number | null> {
      const { stderr } = await ffmpeg(['-nostats', '-i', file, '-map', '0:a:0', '-af', 'ebur128=framelog=quiet', '-f', 'null', '-']);
      return parseLoudness(stderr);
    },

    async extractPicture(file: string, output: string): Promise<void> {
      await ffmpeg(['-y', '-i', file, '-map', '0:v:0', '-frames:v', '1', output], 60_000);
    },
  };
}

export type Ffmpeg = ReturnType<typeof createFfmpeg>;

export function parseProbe(json: unknown): AudioProbe {
  const { streams, format } = probeSchema.parse(json);
  const audio = streams.find((s) => s.codec_type === 'audio');
  if (!audio?.codec_name) throw new Error('The file has no audio stream');

  // Ogg and FLAC keep tags on the stream, MP3 and M4A on the container.
  const tags = Object.fromEntries(Object.entries({ ...format.tags, ...audio.tags }).map(([key, value]) => [key.toLowerCase(), value]));
  const bitrate = Number(audio.bit_rate ?? format.bit_rate);
  return {
    codec: audio.codec_name,
    durationMs: Math.round(Number(format.duration ?? 0) * 1000),
    bitrateKbps: Number.isFinite(bitrate) && bitrate > 0 ? Math.round(bitrate / 1000) : null,
    hasPicture: streams.some((s) => s.codec_type === 'video' && s.disposition?.attached_pic === 1),
    tags,
  };
}

// ffmpeg prints a summary at the end:
//   Integrated loudness:
//     I:         -9.3 LUFS
export function parseLoudness(stderr: string): number | null {
  const match = stderr.match(/Integrated loudness:\s+I:\s+(-?\d+(?:\.\d+)?|-inf) LUFS/);
  if (!match?.[1] || match[1] === '-inf') return null;
  return Number(match[1]);
}
