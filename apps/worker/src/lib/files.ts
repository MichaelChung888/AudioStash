import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';

export async function describeFile(path: string): Promise<{ sizeBytes: number; sha256: string }> {
  const hash = createHash('sha256');
  await pipeline(createReadStream(path), hash);
  return { sizeBytes: (await stat(path)).size, sha256: hash.digest('hex') };
}
