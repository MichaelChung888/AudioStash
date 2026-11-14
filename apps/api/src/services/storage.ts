import { randomUUID } from 'node:crypto';
import { AUDIO_CODECS, AUDIO_EXTENSIONS, type AudioCodec } from '@audiostash/contracts';
import { sanitizeSegment } from '@audiostash/core';
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { Env } from '../env.ts';
import type { Logger } from '../lib/logger.ts';

// File bytes never pass through the API. The API signs short-lived URLs and the
// phone or worker talks to the bucket directly.
export interface Storage {
  presignPut(key: string, contentType: string, expiresInSec: number): Promise<string>;
  presignGet(key: string, expiresInSec: number): Promise<string>;
  // Null when the object does not exist.
  size(key: string): Promise<number | null>;
  // Best effort: failures are logged, not thrown. A leftover object only costs storage.
  remove(keys: readonly string[]): Promise<void>;
  ensureBucket(): Promise<void>;
}

export const storageKeys = {
  audio: (songId: string, codec: AudioCodec) => `songs/${songId}/audio.${AUDIO_EXTENSIONS[codec]}`,
  cover: (songId: string) => `songs/${songId}/cover.jpg`,
  // Every key a song might have, for cleanup when the codec is not known.
  allForSong: (songId: string) => [...AUDIO_CODECS.map((codec) => storageKeys.audio(songId, codec)), storageKeys.cover(songId)],
  incoming: (filename: string) => `incoming/${randomUUID()}/${sanitizeSegment(filename, 'upload')}`,
};

type StorageConfig = Pick<
  Env,
  'S3_ENDPOINT' | 'S3_PUBLIC_ENDPOINT' | 'S3_REGION' | 'S3_BUCKET' | 'S3_ACCESS_KEY_ID' | 'S3_SECRET_ACCESS_KEY' | 'S3_FORCE_PATH_STYLE'
>;

export function createS3Storage(config: StorageConfig, logger: Logger): Storage {
  const clientFor = (endpoint: string) =>
    new S3Client({
      endpoint,
      region: config.S3_REGION,
      forcePathStyle: config.S3_FORCE_PATH_STYLE,
      credentials: { accessKeyId: config.S3_ACCESS_KEY_ID, secretAccessKey: config.S3_SECRET_ACCESS_KEY },
      // The SDK's default checksums are AWS-specific. R2 and RustFS reject or ignore some of them.
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });

  const client = clientFor(config.S3_ENDPOINT);
  // A signature covers the host name, so URLs for the phone are signed with the public address.
  const signer = config.S3_PUBLIC_ENDPOINT ? clientFor(config.S3_PUBLIC_ENDPOINT) : client;
  const Bucket = config.S3_BUCKET;

  return {
    presignPut: (key, contentType, expiresIn) => getSignedUrl(signer, new PutObjectCommand({ Bucket, Key: key, ContentType: contentType }), { expiresIn }),

    presignGet: (key, expiresIn) => getSignedUrl(signer, new GetObjectCommand({ Bucket, Key: key }), { expiresIn }),

    async size(key) {
      try {
        const head = await client.send(new HeadObjectCommand({ Bucket, Key: key }));
        return head.ContentLength ?? 0;
      } catch (error) {
        if (isNotFound(error)) return null;
        throw error;
      }
    },

    async remove(keys) {
      const results = await Promise.allSettled(keys.map((key) => client.send(new DeleteObjectCommand({ Bucket, Key: key }))));
      results.forEach((result, i) => {
        if (result.status === 'rejected') logger.warn({ err: result.reason, key: keys[i] }, 'failed to delete object');
      });
    },

    async ensureBucket() {
      try {
        await client.send(new HeadBucketCommand({ Bucket }));
      } catch (error) {
        if (!isNotFound(error)) throw error;
        await client.send(new CreateBucketCommand({ Bucket }));
        logger.info({ bucket: Bucket }, 'created bucket');
      }
    },
  };
}

function isNotFound(error: unknown): boolean {
  return error instanceof S3ServiceException && error.$metadata.httpStatusCode === 404;
}
