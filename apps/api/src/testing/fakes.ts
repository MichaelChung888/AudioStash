import { randomUUID } from 'node:crypto';
import { type Database, songs } from '@pluck/db';
import { vi } from 'vitest';
import type { NewSong, SongRow } from '../db/songs.ts';
import type { Clerk, ClerkSession } from '../services/clerk.ts';
import type { Notifier } from '../services/notifier.ts';
import type { Storage } from '../services/storage.ts';

// The bucket as a map of key to size. Tests call put() where the phone or worker
// would upload to a presigned URL.
export class MemoryStorage implements Storage {
  readonly objects = new Map<string, number>();

  put(key: string, sizeBytes: number): void {
    this.objects.set(key, sizeBytes);
  }

  async presignPut(key: string): Promise<string> {
    return `https://bucket.test/${key}?upload`;
  }

  async presignGet(key: string): Promise<string> {
    return `https://bucket.test/${key}`;
  }

  async size(key: string): Promise<number | null> {
    return this.objects.get(key) ?? null;
  }

  async remove(keys: readonly string[]): Promise<void> {
    for (const key of keys) this.objects.delete(key);
  }

  async ensureBucket(): Promise<void> {}
}

export function fakeNotifier(): Notifier {
  return { downloadChanged: vi.fn(), itemChanged: vi.fn(), libraryChanged: vi.fn() };
}

export function fakeRelay() {
  return { kick: vi.fn() };
}

// Accepts tokens made by userToken(). Like real session tokens, they keep verifying
// after their session is revoked.
export class FakeClerk implements Clerk {
  readonly sessions = new Map<string, ClerkSession>();

  addSession(userId: string, sessionId: string, latestActivity?: ClerkSession['latestActivity']): string {
    this.sessions.set(sessionId, { id: sessionId, userId, createdAt: 0, lastActiveAt: 60_000, latestActivity });
    return userToken(userId, sessionId);
  }

  async verifySessionToken(token: string) {
    const [prefix, userId, sessionId] = token.split(':');
    return prefix === 'token' && userId && sessionId ? { userId, sessionId } : null;
  }

  async listActiveSessions(userId: string) {
    return [...this.sessions.values()].filter((session) => session.userId === userId);
  }

  async getSession(sessionId: string) {
    return this.sessions.get(sessionId) ?? null;
  }

  async revokeSession(sessionId: string) {
    this.sessions.delete(sessionId);
  }
}

export const userToken = (userId: string, sessionId: string) => `token:${userId}:${sessionId}`;

export async function insertSong(db: Database, overrides: Partial<NewSong> = {}): Promise<SongRow> {
  const id = overrides.id ?? randomUUID();
  const [song] = await db
    .insert(songs)
    .values({
      id,
      title: 'Existing Song',
      artist: 'Existing Artist',
      durationMs: 180_000,
      source: 'youtube',
      sourceId: id.slice(0, 11),
      audioKey: `songs/${id}/audio.opus`,
      audioCodec: 'opus',
      audioSizeBytes: 1_000,
      audioSha256: 'a'.repeat(64),
      path: `Songs/Existing Artist/${id}.opus`,
      ...overrides,
    })
    .returning();
  if (!song) throw new Error('song insert returned nothing');
  return song;
}
