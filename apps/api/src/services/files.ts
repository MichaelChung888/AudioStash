import type { CreateUploadsRequest, CreateUploadsResponse, FileUrlsResponse } from '@pluck/contracts';
import type { Database } from '@pluck/db';
import * as songsDb from '../db/songs.ts';
import { type Storage, storageKeys } from './storage.ts';

interface Deps {
  db: Database;
  storage: Storage;
}

const DOWNLOAD_URL_SECONDS = 60 * 60;
const UPLOAD_URL_SECONDS = 60 * 60;

const expiresAt = (seconds: number) => new Date(Date.now() + seconds * 1000).toISOString();

// Short-lived bucket URLs. Signing is a local calculation, so this makes no network calls.
export function createFileService({ db, storage }: Deps) {
  return {
    // The phone downloads audio and covers straight from the bucket with these.
    async songFileUrls(songIds: readonly string[]): Promise<FileUrlsResponse> {
      const songs = await songsDb.findByIds(db, songIds);
      const files = await Promise.all(
        songs.map(async (song) => ({
          songId: song.id,
          audioUrl: await storage.presignGet(song.audioKey, DOWNLOAD_URL_SECONDS),
          coverUrl: song.coverKey ? await storage.presignGet(song.coverKey, DOWNLOAD_URL_SECONDS) : null,
        })),
      );
      return { files, expiresAt: expiresAt(DOWNLOAD_URL_SECONDS) };
    },

    // Step one of importing files from the phone: upload each file, then create a
    // download with the returned keys.
    async createUploads({ files }: CreateUploadsRequest): Promise<CreateUploadsResponse> {
      const uploads = await Promise.all(
        files.map(async (file) => {
          const key = storageKeys.incoming(file.filename);
          return { key, filename: file.filename, url: await storage.presignPut(key, file.contentType, UPLOAD_URL_SECONDS) };
        }),
      );
      return { uploads, expiresAt: expiresAt(UPLOAD_URL_SECONDS) };
    },
  };
}

export type FileService = ReturnType<typeof createFileService>;
