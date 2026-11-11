import { type DownloadStatus, FINISHED_DOWNLOAD_STATUSES } from '@pluck/contracts';
import type { Transaction } from '@pluck/db';
import type { DownloadRow } from '../db/downloads.ts';
import * as downloadsDb from '../db/downloads.ts';
import type { ItemCounts } from '../db/items.ts';
import * as itemsDb from '../db/items.ts';

export const isFinished = (status: DownloadStatus) => FINISHED_DOWNLOAD_STATUSES.includes(status);

// A download's status is derived from its items, never set piece by piece, so it
// cannot drift out of step with them.
export function deriveDownloadStatus(current: DownloadStatus, counts: ItemCounts): DownloadStatus {
  if (current === 'cancelled') return 'cancelled';
  // Still resolving a playlist link, or the link resolved to nothing (already marked failed).
  if (counts.total === 0) return current;

  const open = counts.queued + counts.active;
  if (open > 0) {
    const started = counts.active > 0 || open < counts.total;
    return started ? 'active' : 'queued';
  }
  if (counts.failed === 0 && counts.cancelled === 0) return 'completed';
  if (counts.completed + counts.skipped === 0) return 'failed';
  return 'partial';
}

// Recounts the items and updates the download's status if it changed.
export async function refreshDownloadStatus(tx: Transaction, download: DownloadRow): Promise<{ download: DownloadRow; counts: ItemCounts }> {
  const counts = (await itemsDb.countByDownload(tx, [download.id])).get(download.id) ?? itemsDb.emptyCounts();
  const status = deriveDownloadStatus(download.status, counts);
  if (status === download.status) return { download, counts };
  const updated = await downloadsDb.update(tx, download.id, { status, finishedAt: isFinished(status) ? new Date() : null });
  return { download: updated, counts };
}
