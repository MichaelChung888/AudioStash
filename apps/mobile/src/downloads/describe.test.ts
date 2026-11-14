import type { Download, DownloadItem } from '@audiostash/contracts';
import { describe, expect, it } from 'vitest';
import { downloadProgress, finishedSummary, openSummary, queueSummary, sourceName, stageLabel } from './describe.ts';

const NOW = '2026-11-11T10:00:00.000Z';

function download(overrides: Partial<Download> = {}): Download {
  return {
    id: 'd1',
    title: 'Gym',
    sourceKind: 'url',
    sourceUrl: 'https://www.youtube.com/playlist?list=PL123',
    status: 'active',
    options: { format: 'best', metadata: true, cover: true, lyrics: true, removeNonMusic: true },
    playlistId: null,
    counts: { total: 32, completed: 12, skipped: 2, failed: 0, cancelled: 0 },
    error: null,
    createdAt: NOW,
    updatedAt: NOW,
    finishedAt: null,
    ...overrides,
  };
}

function item(overrides: Partial<DownloadItem> = {}): DownloadItem {
  return {
    id: 'i1',
    downloadId: 'd1',
    position: 0,
    title: 'Houdini',
    artist: 'Dua Lipa',
    status: 'active',
    stage: 'downloading',
    progress: 0.5,
    songId: null,
    attempts: 1,
    error: null,
    updatedAt: NOW,
    ...overrides,
  };
}

describe('sourceName', () => {
  it('names the site of a link', () => {
    expect(sourceName(download())).toBe('YouTube');
    expect(sourceName(download({ sourceUrl: 'https://soundcloud.com/artist/track' }))).toBe('SoundCloud');
  });

  it('names uploads and catalog picks', () => {
    expect(sourceName(download({ sourceKind: 'upload', sourceUrl: null }))).toBe('This phone');
    expect(sourceName(download({ sourceKind: 'catalog', sourceUrl: null }))).toBe('Search');
  });
});

describe('stageLabel', () => {
  it('adds the percentage while downloading', () => {
    expect(stageLabel({ stage: 'downloading', progress: 0.62 })).toBe('Downloading 62%');
    expect(stageLabel({ stage: 'matching', progress: null })).toBe('Finding the best match');
    expect(stageLabel({ stage: null, progress: null })).toBe('Waiting');
  });
});

describe('downloadProgress', () => {
  it('counts finished songs and part of the active ones', () => {
    expect(downloadProgress(download({ counts: { total: 4, completed: 1, skipped: 0, failed: 1, cancelled: 0 } }), [item({ progress: 0.5 })])).toBe(0.625);
  });

  it('is unknown before the playlist has been read', () => {
    expect(downloadProgress(download({ status: 'resolving', counts: { total: 0, completed: 0, skipped: 0, failed: 0, cancelled: 0 } }))).toBeNull();
  });

  it('is unknown for one song at a stage with no percentage', () => {
    const single = download({ counts: { total: 1, completed: 0, skipped: 0, failed: 0, cancelled: 0 } });
    expect(downloadProgress(single, [item({ stage: 'matching', progress: null })])).toBeNull();
    expect(downloadProgress(single, [item({ progress: 0.3 })])).toBe(0.3);
  });
});

describe('openSummary', () => {
  it('says why a download has not started', () => {
    expect(openSummary(download({ status: 'queued' }), [], false)).toBe('Waiting for the PC');
    expect(openSummary(download({ status: 'queued' }), [], true)).toBe('Waiting to start');
  });

  it('counts songs in a playlist', () => {
    expect(openSummary(download(), [], true)).toBe('YouTube playlist · 14 of 32 songs');
  });

  it('shows the stage of a single song', () => {
    const single = download({ sourceKind: 'catalog', counts: { total: 1, completed: 0, skipped: 0, failed: 0, cancelled: 0 } });
    expect(openSummary(single, [item({ stage: 'matching', progress: null })], true)).toBe('Dua Lipa · Finding the best match');
  });
});

describe('finishedSummary', () => {
  it('counts skipped songs as saved, because they were already in the library', () => {
    expect(finishedSummary(download({ status: 'partial', counts: { total: 33, completed: 30, skipped: 1, failed: 2, cancelled: 0 } }))).toEqual({
      saved: '31 of 33 saved',
      failed: '2 failed',
    });
  });

  it('says when a download was cancelled', () => {
    expect(finishedSummary(download({ status: 'cancelled' })).saved).toBe('Cancelled');
  });
});

describe('queueSummary', () => {
  it('counts running and waiting downloads', () => {
    expect(queueSummary([download(), download({ status: 'resolving' }), download({ status: 'queued' })])).toBe('2 downloading, 1 waiting');
    expect(queueSummary([])).toBe('Nothing to download');
  });
});
