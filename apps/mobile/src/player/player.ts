import { gainToVolume } from '@audiostash/core';
import { type AudioPlayer, type AudioPlaylist, type AudioPlaylistStatus, createAudioPlayer, createAudioPlaylist, setAudioModeAsync } from 'expo-audio';
import { api } from '../api/endpoints.ts';
import { type LibrarySong, listSongIds } from '../db/library.ts';
import { recordPlay } from '../db/mutations.ts';
import { keepSongs, nextRepeatMode, playCountsAt, playOrder, type RepeatMode, startQueue } from './queue.ts';

// One player for the whole app, kept outside React so playback carries on while
// screens come and go. Android's media session gives it lock screen and headphone controls.
//
// The native playlist holds the songs in play order. `songs` is the list as chosen
// and `order` maps each play position to an index in it, so shuffle can be turned
// off again without losing the original order.
//
// Previews of songs not in the library play on a second, simpler player, so they
// pause the queue instead of replacing it. Only one of the two plays at a time.

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
  // The id of the catalog track whose preview is playing.
  previewId: string | null;
  previewLoading: boolean;
}

let playlist: AudioPlaylist | null = null;
let previewPlayer: AudioPlayer | null = null;
let songs: LibrarySong[] = [];
let order: number[] = [];
let snapshot: PlayerSnapshot = { source: null, queue: [], position: 0, current: null, shuffle: false, repeat: 'none', previewId: null, previewLoading: false };
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
  created.addListener('trackChanged', () => onTrackChanged(created.currentIndex));
  created.addListener('playlistStatusUpdate', countPlay);
  created.addListener('playlistStatusUpdate', () => {
    if (created.playing) stopPreview();
  });
  setAudioMode();
  playlist = created;
  return created;
}

export async function togglePreview(trackId: string, deezerId: number): Promise<void> {
  // A second tap on the same song stops its preview.
  if (snapshot.previewId === trackId) {
    stopPreview();
    return;
  }

  // Pause, not stop, so the queue can resume where it was.
  if (playlist?.playing) playlist.pause();
  previewPlayer?.pause();
  update({ previewId: trackId, previewLoading: true });

  // Fetched on tap, because Deezer's links expire after 15 minutes.
  let url: string;
  try {
    url = await api.previewUrl(deezerId);
  } catch (error) {
    if (snapshot.previewId === trackId) stopPreview();
    throw error;
  }

  // Another preview, or the queue, may have started while the link loaded.
  if (snapshot.previewId !== trackId) return;

  const player = getPreviewPlayer();
  player.replace({ uri: url });
  player.play();
  update({ previewLoading: false });
}

export function stopPreview(): void {
  if (snapshot.previewId === null) return;
  previewPlayer?.pause();
  update({ previewId: null, previewLoading: false });
}

export function getPreviewPlayer(): AudioPlayer {
  if (previewPlayer) return previewPlayer;
  const created = createAudioPlayer(null, { updateInterval: 250 }); // Updates 4 times/s, so the 30s progress bar moves smoothly.
  created.addListener('playbackStatusUpdate', (status) => {
    if (status.didJustFinish) stopPreview();
  });
  setAudioMode();
  previewPlayer = created;
  return created;
}

function setAudioMode(): void {
  void setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: true, interruptionMode: 'doNotMix' });
}

export function playSongs(list: readonly LibrarySong[], start: number, source: PlaySource): void {
  // Songs without a file on the phone are left out: they cannot play yet.
  songs = list.filter((song) => song.fileUri !== null);
  if (songs.length === 0) return;

  // Find the song the user tapped in the list, that plays first
  const startId = list[start]?.id;
  const first = Math.max(
    0,
    songs.findIndex((song) => song.id === startId),
  );

  const queue = startQueue(songs.length, first, snapshot.shuffle);
  order = queue.order;

  const player = getPlaylist();
  player.clear();
  for (const index of order) player.add(toSource(songs[index] as LibrarySong));
  player.skipTo(queue.position);
  player.play();
  update({ source, position: queue.position });
  onTrackChanged(queue.position);
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
// If Repeat all is on and the first song is playing, go back to the last song.
export function previous(): void {
  const player = getPlaylist();
  const atStart = snapshot.position === 0 && snapshot.repeat !== 'all';
  if (player.currentTime > 3 || atStart) void player.seekTo(0);
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
  stopPreview();
  if (!playlist) return;
  playlist.clear();
  playlist.clearLockScreenControls();
  songs = [];
  order = [];
  update({ source: null, position: 0 });
}

export async function dropDeletedSongs(): Promise<void> {
  if (songs.length === 0) return;
  const ids = await listSongIds();
  const isKept = (song: LibrarySong) => ids.has(song.id);
  // Read the queue after the wait: a new one may have started meanwhile.
  if (!playlist || songs.every(isKept)) return;
  if (!songs.some(isKept)) {
    stopPlayback();
    return;
  }

  const playing = snapshot.current;
  for (let position = order.length - 1; position >= 0; position--) {
    if (!isKept(songs[order[position] as number] as LibrarySong)) playlist.remove(position);
  }
  ({ songs, order } = keepSongs(songs, order, isKept));
  update({ position: playlist.currentIndex });
  // When the playing song is removed, the next one takes its position and the
  // native player sends no track change.
  if (snapshot.current !== playing) onTrackChanged(snapshot.position);
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
