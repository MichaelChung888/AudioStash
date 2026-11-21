import { useAudioPlaylistStatus } from 'expo-audio';
import { useSyncExternalStore } from 'react';
import { getPlayerSnapshot, getPlaylist, onPlayerChange, type PlayerSnapshot } from './player.ts';

export function usePlayer(): PlayerSnapshot {
  return useSyncExternalStore(onPlayerChange, getPlayerSnapshot);
}

export type PreviewState = 'loading' | 'playing' | null;

// Re-renders only when this track's preview changes state, not on every player change.
export function usePreviewState(trackId: string): PreviewState {
  return useSyncExternalStore(onPlayerChange, () => {
    const { previewId, previewLoading } = getPlayerSnapshot();
    if (previewId !== trackId) return null;
    return previewLoading ? 'loading' : 'playing';
  });
}

// Updates twice a second while playing, so only the mini player and the player screen use it.
export function usePlaybackStatus() {
  return useAudioPlaylistStatus(getPlaylist());
}
