import { z } from 'zod';

const booleanString = z.enum(['true', 'false']).transform((v) => v === 'true');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent']).default('info'),

  // Used for Clerk's API (listing and revoking sessions) and, when CLERK_JWT_KEY is
  // not set, to download the public keys that token signatures are checked against.
  CLERK_SECRET_KEY: z.string().startsWith('sk_'),
  // The PEM public key from the API keys page in the Clerk dashboard, on one line.
  // With it, tokens are checked without calling Clerk.
  CLERK_JWT_KEY: z.string().min(1).optional(),
  // Comma-separated Clerk user ids allowed to use this API. Anyone else who signs in gets 403.
  CLERK_ALLOWED_USER_IDS: z
    .string()
    .transform((value) =>
      value
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean),
    )
    .pipe(z.array(z.string().startsWith('user_')).min(1)),

  DATABASE_URL: z.url(),
  RABBITMQ_URL: z.url(),

  S3_ENDPOINT: z.url(),
  // Presigned URLs embed the host they were signed for, so they must be signed with
  // an address the phone and worker can reach. Defaults to S3_ENDPOINT.
  S3_PUBLIC_ENDPOINT: z.url().optional(),
  S3_REGION: z.string().default('auto'),
  S3_BUCKET: z.string().min(1),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1),
  S3_FORCE_PATH_STYLE: booleanString.default(true),
  S3_CREATE_BUCKET: booleanString.default(false),

  WORKER_TOKEN: z.string().min(32, 'WORKER_TOKEN must be at least 32 characters'),

  YOUTUBE_API_KEY: z.string().min(1).optional(),
  CATALOG_COUNTRY: z
    .string()
    .regex(/^[a-z]{2}$/)
    .default('gb'),
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
