import type { CatalogTrack, YoutubeVideo } from '@audiostash/contracts';
import type { ParsedSourceUrl } from '@audiostash/core';
import type { DocumentPickerAsset } from 'expo-document-picker';
import { router } from 'expo-router';

// What the download sheet was opened for.
export type AddRequest =
  | { kind: 'tracks'; tracks: CatalogTrack[] }
  | { kind: 'video'; video: YoutubeVideo }
  | { kind: 'link'; link: ParsedSourceUrl }
  | { kind: 'files'; files: DocumentPickerAsset[] };

// Handed over in memory because it does not fit in route params. If Android closes
// the app while the sheet is open, the sheet reopens empty and closes itself.
let pending: AddRequest | null = null;

export function openAddSheet(request: AddRequest): void {
  pending = request;
  router.push('/add');
}

export function getAddRequest(): AddRequest | null {
  return pending;
}
