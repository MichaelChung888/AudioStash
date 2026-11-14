import type { BusEvent, Download, DownloadItem } from '@audiostash/contracts';
import type { EventPublisher } from '@audiostash/messaging';
import type { Logger } from '../lib/logger.ts';

// Publishes change notifications after a transaction commits. Fire and forget:
// phones re-read state when they reconnect, so a lost event only delays an update.
export interface Notifier {
  downloadChanged(download: Download): void;
  itemChanged(item: DownloadItem): void;
  libraryChanged(cursor: number | null): void;
}

export function createNotifier(bus: EventPublisher, logger: Logger): Notifier {
  const publish = (event: BusEvent) => {
    bus.publish(event).catch((err: unknown) => logger.warn({ err, type: event.type }, 'event publish failed'));
  };
  return {
    downloadChanged: (download) => publish({ type: 'download.updated', download }),
    itemChanged: (item) => publish({ type: 'download.item.updated', item }),
    libraryChanged: (cursor) => {
      if (cursor !== null) publish({ type: 'library.changed', cursor });
    },
  };
}
