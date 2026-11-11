import { describe, expect, it } from 'vitest';
import { emptyCounts, type ItemCounts } from '../db/items.ts';
import { deriveDownloadStatus } from './download-status.ts';

const counts = (partial: Partial<ItemCounts>): ItemCounts => {
  const result = { ...emptyCounts(), ...partial };
  result.total = result.queued + result.active + result.completed + result.skipped + result.failed + result.cancelled;
  return result;
};

describe('deriveDownloadStatus', () => {
  it('keeps a cancelled download cancelled', () => {
    expect(deriveDownloadStatus('cancelled', counts({ queued: 3 }))).toBe('cancelled');
  });

  it('keeps the current status while there are no items', () => {
    expect(deriveDownloadStatus('resolving', counts({}))).toBe('resolving');
    expect(deriveDownloadStatus('failed', counts({}))).toBe('failed');
  });

  it('is queued until any item starts or finishes', () => {
    expect(deriveDownloadStatus('resolving', counts({ queued: 5 }))).toBe('queued');
  });

  it('is active while some items are open and work has started', () => {
    expect(deriveDownloadStatus('queued', counts({ queued: 4, active: 1 }))).toBe('active');
    expect(deriveDownloadStatus('queued', counts({ queued: 4, completed: 1 }))).toBe('active');
    expect(deriveDownloadStatus('queued', counts({ queued: 4, skipped: 1 }))).toBe('active');
  });

  it('is completed when every item completed or was skipped', () => {
    expect(deriveDownloadStatus('active', counts({ completed: 3, skipped: 2 }))).toBe('completed');
  });

  it('is failed when nothing succeeded', () => {
    expect(deriveDownloadStatus('active', counts({ failed: 3 }))).toBe('failed');
  });

  it('is partial when some items succeeded and some failed', () => {
    expect(deriveDownloadStatus('active', counts({ completed: 2, failed: 1 }))).toBe('partial');
  });

  it('reopens a finished download when items are queued again', () => {
    expect(deriveDownloadStatus('partial', counts({ completed: 2, queued: 1 }))).toBe('active');
  });
});
