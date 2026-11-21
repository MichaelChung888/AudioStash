import { useAudioPlayerStatus, useAudioPlaylistStatus } from 'expo-audio';
import { useSyncExternalStore } from 'react';
import { getPlayerSnapshot, getPlaylist, getPreviewPlayer, onPlayerChange, type PlayerSnapshot } from './player.ts';

export function usePlayer(): PlayerSnapshot {
  return useSyncExternalStore(onPlayerChange, getPlayerSnapshot);
}

export type PreviewState = 'loading' | 'playing' | null;

// Re-renders only the row whose preview changes. Otherwise every row would re-render on every player change.
export function usePreviewState(trackId: string): PreviewState {
  return useSyncExternalStore(onPlayerChange, () => {
    const { previewId, previewLoading } = getPlayerSnapshot();
    if (previewId !== trackId) return null;
    return previewLoading ? 'loading' : 'playing';
  });
}

// Only for the preview's progress bar. Otherwise every row would re-render four times a second.
export function usePreviewStatus() {
  return useAudioPlayerStatus(getPreviewPlayer());
}

// Only where something moves with the song: the mini player, Now Playing and the playing bars.
// Otherwise the component re-renders twice a second for nothing.
export function usePlaybackStatus() {
  return useAudioPlaylistStatus(getPlaylist());
}
