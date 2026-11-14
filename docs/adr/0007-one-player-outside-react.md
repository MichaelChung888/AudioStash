# 0007. One audio player for the whole app, kept outside React

Date: 2026-11

## Status

Accepted

## Context

AudioStash plays songs from files on the phone. Playback must:

- carry on while the owner moves between screens, and with the screen off;
- show lock screen and notification controls, and answer headphone buttons;
- move to the next song without waiting for the app's JavaScript;
- support shuffle, repeat, and a queue built from a playlist or from All songs.

Two screens show playback: the mini player above the tabs, and the full player. Both need the current song, and both show a progress bar that moves.

React components come and go as screens open and close. State kept inside a component ends when that component unmounts.

## Decision

- **One player, made once.** `src/player/player.ts` holds a single `AudioPlaylist` from `expo-audio` in a module variable. A module variable lives as long as the app process, whatever screens are open. The native player is created the first time something plays, not at start-up.
- **A native playlist.** The whole queue is handed to the native playlist, which moves to the next song itself. Android's media session (the system service behind lock screen and headphone controls) is turned on with `setActiveForLockScreen`.
- **Two separate hooks.** `usePlayer()` returns the queue, current song, shuffle and repeat. It uses React's `useSyncExternalStore`, which re-renders a component only when that value changes, so it changes only when the song or a setting changes. `usePlaybackStatus()` returns the position and duration, updated twice a second. Only the mini player, the full player, and the play button of the playlist that is playing use it, so a moving progress bar does not re-render other screens.
- **Shuffle keeps the original order.** The player keeps the songs as chosen plus a separate play order. Turning shuffle on or off rebuilds the play order around the song that is playing, which keeps playing.
- **Volume levelling.** Each song's loudness is measured when it is downloaded. The player turns loud songs down to match the rest. It cannot turn quiet songs up, because the player's volume cannot go above 1.
- **Play counts.** A play counts after 30 seconds, or half the song if it is shorter. It is recorded as a normal library edit (see [0005](0005-local-database-on-the-phone.md)).

## Options considered

| Option                               | Why it lost                                                                                                                                                                      |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `react-native-track-player`          | A separate native module outside the Expo SDK, so every Expo upgrade waits for it to catch up. `expo-audio` now has playlists and lock screen controls, and ships with each SDK. |
| One `expo-audio` player per screen   | The song would stop when its screen closed. The app's JavaScript would also have to start each next song, which leaves a gap.                                                    |
| Keep player state in a React context | Every status update, twice a second, would re-render everything under the context.                                                                                               |

## Consequences

- Playback survives screen changes and runs in the background through the media playback service that the `expo-audio` config plugin adds.
- Only songs saved on the phone can play. A song not saved yet is shown in its playlist but cannot be tapped.
- The queue is not saved. If Android closes the app, the next launch starts with nothing playing.
- Sign-out calls `stopPlayback()` before it clears the library, so the player never points at files of a library that is gone.

## Where the code is

- [apps/mobile/src/player/player.ts](../../apps/mobile/src/player/player.ts): the player
- [apps/mobile/src/player/queue.ts](../../apps/mobile/src/player/queue.ts): play order, repeat, when a play counts
- [apps/mobile/src/player/hooks.ts](../../apps/mobile/src/player/hooks.ts): the two hooks
- [packages/core/src/loudness.ts](../../packages/core/src/loudness.ts): gain to volume
