import { useAudioPlaylistStatus } from 'expo-audio';
import { useSyncExternalStore } from 'react';
import { getPlayerSnapshot, getPlaylist, onPlayerChange, type PlayerSnapshot } from './player.ts';

export function usePlayer(): PlayerSnapshot {
  return useSyncExternalStore(onPlayerChange, getPlayerSnapshot);
}

// Updates twice a second while playing, so only the mini player and the player screen use it.
export function usePlaybackStatus() {
  return useAudioPlaylistStatus(getPlaylist());
}
