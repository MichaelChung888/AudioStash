// Catalog songs this phone asked to download, by track id, with the download that fetches each.
// Kept in memory only, so after a restart the rows show the download button again until the song arrives.
const requested = new Map<string, string>();

export function rememberRequested(downloadId: string, trackIds: readonly string[]): void {
  for (const trackId of trackIds) requested.set(trackId, downloadId);
}

// The download this phone started for the song, if any.
export function requestedDownload(trackId: string): string | undefined {
  return requested.get(trackId);
}
