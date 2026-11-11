import { z } from 'zod';
import { timestampSchema } from './common.ts';

export const statusResponseSchema = z.object({
  api: z.object({ version: z.string() }),
  worker: z.object({
    online: z.boolean(),
    lastSeenAt: timestampSchema.nullable(),
    version: z.string().nullable(),
  }),
});
export type StatusResponse = z.infer<typeof statusResponseSchema>;
