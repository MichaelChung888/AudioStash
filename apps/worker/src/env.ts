import { hostname, tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent']).default('info'),

  // The worker reaches the API and RabbitMQ through Tailscale, so neither needs to be public.
  API_URL: z.url(),
  RABBITMQ_URL: z.url(),
  WORKER_TOKEN: z.string().min(32, 'WORKER_TOKEN must be at least 32 characters'),

  WORKER_ID: z.string().min(1).max(100).default(hostname()),
  // Songs processed at once. Each one runs yt-dlp and ffmpeg, so more than a few
  // mostly adds load on YouTube and makes rate limiting more likely.
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(8).default(2),
  WORK_DIR: z.string().default(join(tmpdir(), 'pluck-worker')),

  YTDLP_PATH: z.string().default('yt-dlp'),
  FFMPEG_PATH: z.string().default('ffmpeg'),
  FFPROBE_PATH: z.string().default('ffprobe'),
  PYTHON_PATH: z.string().default('python3'),
  // A Netscape-format cookies file from a signed-in browser. Needed only for
  // age-restricted videos, or when YouTube asks to confirm you are not a bot.
  YTDLP_COOKIES_FILE: z.string().min(1).optional(),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  // `KEY=` with nothing after it counts as not set, so optional values can be left blank.
  const parsed = envSchema.safeParse(Object.fromEntries(Object.entries(source).filter(([, value]) => value !== '')));
  if (!parsed.success) {
    console.error('Invalid environment variables:');
    console.error(z.flattenError(parsed.error).fieldErrors);
    process.exit(1);
  }
  return parsed.data;
}
