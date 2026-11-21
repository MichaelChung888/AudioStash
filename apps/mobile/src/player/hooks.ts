import { useAudioPlaylistStatus } from 'expo-audio';
import { useSyncExternalStore } from 'react';
import { getPlayerSnapshot, getPlaylist, onPlayerChange, type PlayerSnapshot } from './player.ts';

export function usePlayer(): PlayerSnapshot {
  return useSyncExternalStore(onPlayerChange, getPlayerSnapshot);
}

// Re-renders only when this track's preview starts or stops, not on every player change.
export function usePreviewing(trackId: string): boolean {
  return useSyncExternalStore(onPlayerChange, () => getPlayerSnapshot().previewId === trackId);
}

// Updates twice a second while playing, so only the mini player and the player screen use it.
export function usePlaybackStatus() {
  return useAudioPlaylistStatus(getPlaylist());
}
