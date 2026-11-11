import { useSyncExternalStore } from 'react';
import { getMirrorState, type MirrorState, onMirrorState } from './mirror.ts';

export function useMirrorState(): MirrorState {
  return useSyncExternalStore(onMirrorState, getMirrorState);
}
