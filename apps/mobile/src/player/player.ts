import { gainToVolume } from '@pluck/core';
import { type AudioPlaylist, type AudioPlaylistStatus, createAudioPlaylist, setAudioModeAsync } from 'expo-audio';
import type { LibrarySong } from '../db/library.ts';
import { recordPlay } from '../db/mutations.ts';
import { nextRepeatMode, playCountsAt, playOrder, type RepeatMode } from './queue.ts';

// One player for the whole app, kept outside React so playback carries on while
// screens come and go. Android's media session gives it lock screen and headphone controls.
//
// The native playlist holds the songs in play order. `songs` is the list as chosen
// and `order` maps each play position to an index in it, so shuffle can be turned
// off again without losing the original order.

// Where the songs came from: a playlist, or "all" for All songs.
export interface PlaySource {
  id: string;
  name: string;
}

export interface PlayerSnapshot {
  source: PlaySource | null;
  queue: LibrarySong[];
  // Position in `queue` of the song playing now.
  position: number;
  current: LibrarySong | null;
  shuffle: boolean;
  repeat: RepeatMode;
}

let playlist: AudioPlaylist | null = null;
let songs: LibrarySong[] = [];
let order: number[] = [];
let snapshot: PlayerSnapshot = { source: null, queue: [], position: 0, current: null, shuffle: false, repeat: 'none' };
const listeners = new Set<() => void>();
let playCounted = false;

export function getPlayerSnapshot(): PlayerSnapshot {
  return snapshot;
}

export function onPlayerChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getPlaylist(): AudioPlaylist {
  if (playlist) return playlist;
  const created = createAudioPlaylist({ updateInterval: 500, loop: 'none' });
  created.addListener('trackChanged', ({ currentIndex }) => onTrackChanged(currentIndex));
  created.addListener('playlistStatusUpdate', countPlay);
  void setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: true, interruptionMode: 'doNotMix' });
  playlist = created;
  return created;
}

// Songs without a file on the phone are left out: they cannot play yet.
export function playSongs(list: readonly LibrarySong[], start: number, source: PlaySource): void {
  const startId = list[start]?.id;
  songs = list.filter((song) => song.fileUri !== null);
  if (songs.length === 0) return;
  const first = Math.max(
    0,
    songs.findIndex((song) => song.id === startId),
  );
  order = playOrder(songs.length, first, snapshot.shuffle);

  const player = getPlaylist();
  player.clear();
  for (const index of order) player.add(toSource(songs[index] as LibrarySong));
  player.skipTo(0);
  player.play();
  update({ source, position: 0 });
  onTrackChanged(0);
  const current = snapshot.current;
  if (current) player.setActiveForLockScreen(true, toMetadata(current), { showNextTrack: true, showPreviousTrack: true });
}

export function togglePlay(): void {
  const player = getPlaylist();
  if (player.playing) player.pause();
  else if (snapshot.current) player.play();
}

export function next(): void {
  getPlaylist().next();
}

// Like most players: restart the song if it has played a few seconds, otherwise go back one.
export function previous(): void {
  const player = getPlaylist();
  if (player.currentTime > 3 || snapshot.position === 0) void player.seekTo(0);
  else player.previous();
}

export function seekTo(seconds: number): void {
  void getPlaylist().seekTo(seconds);
}

export function skipTo(position: number): void {
  getPlaylist().skipTo(position);
}

export function cycleRepeat(): void {
  const repeat = nextRepeatMode(snapshot.repeat);
  getPlaylist().loop = repeat;
  update({ repeat });
}

// Rebuilds the play order around the current song, which keeps playing.
export function setShuffle(shuffle: boolean): void {
  if (shuffle === snapshot.shuffle) return;
  const playingIndex = order[snapshot.position];
  if (playingIndex === undefined) {
    update({ shuffle });
    return;
  }

  const nextOrder = playOrder(songs.length, playingIndex, shuffle);
  const at = nextOrder.indexOf(playingIndex);
  const player = getPlaylist();
  for (let i = order.length - 1; i > snapshot.position; i--) player.remove(i);
  for (let i = snapshot.position - 1; i >= 0; i--) player.remove(i);
  for (const [i, index] of nextOrder.slice(0, at).entries()) player.insert(toSource(songs[index] as LibrarySong), i);
  for (const index of nextOrder.slice(at + 1)) player.add(toSource(songs[index] as LibrarySong));

  order = nextOrder;
  update({ shuffle, position: at });
}

export function stopPlayback(): void {
  if (!playlist) return;
  playlist.clear();
  playlist.clearLockScreenControls();
  songs = [];
  order = [];
  update({ source: null, position: 0 });
}

function onTrackChanged(position: number): void {
  playCounted = false;
  update({ position });
  const song = snapshot.current;
  if (!song || !playlist) return;
  // Loud songs are turned down to the same loudness as the rest. See core/loudness.ts.
  playlist.volume = gainToVolume(song.loudness?.gainDb ?? 0);
  playlist.updateLockScreenMetadata(toMetadata(song));
}

function countPlay(status: AudioPlaylistStatus): void {
  const song = snapshot.current;
  if (playCounted || !song || status.duration <= 0) return;
  if (status.currentTime >= playCountsAt(status.duration)) {
    playCounted = true;
    void recordPlay(song.id);
  }
}

function update(changes: Partial<Omit<PlayerSnapshot, 'queue' | 'current'>>): void {
  const merged = { ...snapshot, ...changes };
  const queue = order.map((index) => songs[index] as LibrarySong);
  snapshot = { ...merged, queue, current: queue[merged.position] ?? null };
  for (const listener of listeners) listener();
}

function toSource(song: LibrarySong) {
  return { uri: song.fileUri ?? undefined, name: song.title };
}

function toMetadata(song: LibrarySong) {
  return { title: song.title, artist: song.artist, albumTitle: song.album ?? undefined, artworkUrl: song.coverUri ?? undefined };
}
