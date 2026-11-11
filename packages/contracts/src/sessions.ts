import { z } from 'zod';
import { timestampSchema } from './common.ts';

// A device signed in to the owner's Clerk account. Each sign-in is one Clerk session.
export const sessionSchema = z.object({
  id: z.string(),
  // From Clerk's record of the session's latest request, e.g. "iPhone · Safari". Null when Clerk has none.
  device: z.string().nullable(),
  location: z.string().nullable(),
  createdAt: timestampSchema,
  lastActiveAt: timestampSchema,
  current: z.boolean(),
});
export type Session = z.infer<typeof sessionSchema>;

export const sessionIdParamSchema = z.object({ id: z.string().regex(/^sess_\w+$/) });
