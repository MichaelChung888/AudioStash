import { z } from 'zod';
import { idSchema } from './common.ts';

// Job messages carry ids only. The worker loads the current state from the API
// when it claims the job, so a message that sat in a queue never acts on stale data.
export const JOB_SCHEMAS = {
  'download.resolve': z.object({ downloadId: idSchema }),
  'download.item': z.object({ downloadId: idSchema, itemId: idSchema }),
} as const;

export type JobName = keyof typeof JOB_SCHEMAS;
export type JobPayload<N extends JobName> = z.infer<(typeof JOB_SCHEMAS)[N]>;
export const JOB_NAMES = Object.keys(JOB_SCHEMAS) as JobName[];
