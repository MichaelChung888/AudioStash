import type { Download, DownloadItem, ItemStage } from '@pluck/contracts';
import { parseSourceUrl } from '@pluck/core';

const SOURCE_NAMES = { youtube: 'YouTube', soundcloud: 'SoundCloud', bandcamp: 'Bandcamp', upload: 'Upload', other: 'Link' } as const;

const STAGE_LABELS: Record<ItemStage, string> = {
  matching: 'Finding the best match',
  downloading: 'Downloading',
  processing: 'Processing',
  uploading: 'Uploading',
};

export function sourceName(download: Pick<Download, 'sourceKind' | 'sourceUrl'>): string {
  if (download.sourceKind === 'upload') return 'This phone';
  if (download.sourceKind === 'catalog') return 'Search';
  const parsed = download.sourceUrl ? parseSourceUrl(download.sourceUrl) : null;
  return parsed ? SOURCE_NAMES[parsed.source] : 'Link';
}

export function stageLabel(item: Pick<DownloadItem, 'stage' | 'progress'>): string {
  if (!item.stage) return 'Waiting';
  const label = STAGE_LABELS[item.stage];
  return item.stage === 'downloading' && item.progress !== null ? `${label} ${Math.round(item.progress * 100)}%` : label;
}

function settled(download: Download): number {
  const { completed, skipped, failed, cancelled } = download.counts;
  return completed + skipped + failed + cancelled;
}

// 0 to 1, counting part of each song in progress. Null when there is no way to tell yet.
export function downloadProgress(download: Download, items: readonly DownloadItem[] = []): number | null {
  const { total } = download.counts;
  if (total === 0) return null;
  const active = items.filter((item) => item.status === 'active');
  if (total === 1 && active.length === 1 && active[0]?.progress === null) return null;
  const partial = active.reduce((sum, item) => sum + (item.progress ?? 0), 0);
  return Math.min(1, (settled(download) + partial) / total);
}

export function openSummary(download: Download, items: readonly DownloadItem[], workerOnline: boolean): string {
  const { total } = download.counts;
  if (download.status === 'queued') return workerOnline ? 'Waiting to start' : 'Waiting for the PC';
  if (download.status === 'resolving') return download.sourceKind === 'url' ? 'Reading the link' : 'Starting';
  if (total === 1) {
    const item = items[0];
    if (!item) return 'Downloading';
    return item.artist ? `${item.artist} · ${stageLabel(item)}` : stageLabel(item);
  }
  const what = download.sourceKind === 'upload' ? 'Files' : download.sourceKind === 'catalog' ? 'Songs' : `${sourceName(download)} playlist`;
  return `${what} · ${settled(download)} of ${total} songs`;
}

export function finishedSummary(download: Download): { saved: string; failed: string | null } {
  const { total, completed, skipped, failed } = download.counts;
  if (download.status === 'cancelled') return { saved: 'Cancelled', failed: null };
  if (total === 0) return { saved: 'Nothing was saved', failed: null };
  return { saved: `${completed + skipped} of ${total} saved`, failed: failed > 0 ? `${failed} failed` : null };
}

// For the "Home PC" line: "2 downloading, 1 waiting".
export function queueSummary(downloads: readonly Download[]): string {
  const waiting = downloads.filter((d) => d.status === 'queued').length;
  const running = downloads.length - waiting;
  const parts = [running > 0 ? `${running} downloading` : null, waiting > 0 ? `${waiting} waiting` : null].filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : 'Nothing to download';
}
