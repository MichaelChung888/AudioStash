// Turns a folder URI from the Android picker into the path a person recognises.
// content://com.android.externalstorage.documents/tree/primary%3AMusic/document/primary%3AMusic%2FAudioStash -> "Music/AudioStash"
export function folderLabel(uri: string): string {
  const marker = uri.lastIndexOf('/document/') >= 0 ? '/document/' : '/tree/';
  const index = uri.lastIndexOf(marker);
  if (index < 0) return uri;
  const documentId = decodeURIComponent(uri.slice(index + marker.length));
  // The id is "<volume>:<path>". "primary" is the phone's own storage; anything else is an SD card.
  const colon = documentId.indexOf(':');
  if (colon < 0) return documentId;
  const volume = documentId.slice(0, colon);
  const path = documentId.slice(colon + 1) || 'Storage';
  return volume === 'primary' ? path : `SD card/${path}`;
}
