import { z } from 'zod';

export const idSchema = z.uuid();
export const timestampSchema = z.iso.datetime({ offset: true });

export const idParamSchema = z.object({ id: idSchema });

export const ERROR_CODES = ['bad_request', 'validation_failed', 'unauthorized', 'forbidden', 'not_found', 'conflict', 'unavailable', 'internal'] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export const errorBodySchema = z.object({
  error: z.object({
    code: z.enum(ERROR_CODES),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});
export type ErrorBody = z.infer<typeof errorBodySchema>;
