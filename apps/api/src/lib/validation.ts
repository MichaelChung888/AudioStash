import { zValidator } from '@hono/zod-validator';
import type { ValidationTargets } from 'hono';
import type { z } from 'zod';
import { ValidationError } from './errors.ts';

// zValidator with our error shape. Throwing hands the failure to the app's error
// handler, so every 400 response looks the same.
export const validate = <Target extends keyof ValidationTargets, S extends z.ZodType>(target: Target, schema: S) =>
  zValidator(target, schema, (result) => {
    if (!result.success) {
      throw new ValidationError(result.error.issues.map((issue) => ({ path: issue.path.map(String).join('.'), message: issue.message })));
    }
  });
