import type { QueryClient } from '@tanstack/react-query';
import { addNetworkStateListener } from 'expo-network';
import { AppState } from 'react-native';
import { openEventStream } from './api/events.ts';
import { applyEvent, keys } from './api/queries.ts';
import { clearLibrary } from './db/database.ts';
import { runMirror, stopMirror } from './files/mirror.ts';
import { stopPlayback } from './player/player.ts';
import { onSynced, requestSync } from './sync/engine.ts';

// What runs while signed in: sync, live events from the server, and saving songs to
// the music folder. Returns a function that stops it all.
export function startSession(client: QueryClient): () => void {
  // Saving runs only after a complete sync. See files/mirror.ts.
  const offSynced = onSynced(() => void runMirror());

  // The event stream stays open only while the app is on screen. Opening it syncs,
  // which picks up any changes missed while it was closed.
  let closeStream: (() => void) | null = null;
  const openStream = () => {
    closeStream ??= openEventStream({
      onOpen: () => {
        void requestSync();
        void client.invalidateQueries({ queryKey: keys.status });
        void client.invalidateQueries({ queryKey: ['downloads'] });
        void client.invalidateQueries({ queryKey: ['download'] });
      },
      onEvent: (event) => applyEvent(client, event),
    });
  };
  const closeStreamNow = () => {
    closeStream?.();
    closeStream = null;
  };

  if (AppState.currentState === 'active') openStream();
  else void requestSync();
  const appState = AppState.addEventListener('change', (next) => (next === 'active' ? openStream() : closeStreamNow()));

  // Back online, or moved to Wi-Fi: sync, which also restarts saving songs that waited for Wi-Fi.
  const network = addNetworkStateListener(({ isConnected }) => {
    if (isConnected) void requestSync();
  });

  return () => {
    offSynced();
    closeStreamNow();
    appState.remove();
    network.remove();
  };
}

// Files in the music folder stay. Signing in again matches them up without downloading them again.
export async function signOutOfPhone(client: QueryClient, signOut: () => Promise<void>): Promise<void> {
  await stopMirror();
  stopPlayback();
  await signOut();
  // Waits for a sync that was already running. Any new one fails at once with no session.
  await requestSync();
  await clearLibrary();
  client.clear();
}
