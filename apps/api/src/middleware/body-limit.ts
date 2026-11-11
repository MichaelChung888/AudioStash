import { bodyLimit } from 'hono/body-limit';
import { AppError } from '../lib/errors.ts';

const MB = 1024 * 1024;

const limit = (maxSize: number) =>
  bodyLimit({
    maxSize,
    onError: () => {
      throw new AppError(413, 'bad_request', `Request body is larger than ${maxSize / MB} MB`);
    },
  });

export const userBodyLimit = limit(MB);
// A resolved playlist can list 5,000 songs.
export const workerBodyLimit = limit(8 * MB);
