import { Directory, File, Paths } from 'expo-file-system';
import { getNetworkStateAsync, NetworkStateType } from 'expo-network';
import { api } from '../api/endpoints.ts';
import { db, notifyLibraryChanged } from '../db/database.ts';
import { getMobileDataAllowed } from '../db/settings.ts';
import { getLibraryRoot } from './library-folder.ts';
import { planPlaylists, planSongs, type SavedPlaylist, type SavedSong, splitPath, type WantedPlaylist, type WantedSong } from './plan.ts';

// Makes the music folder match the library: saves songs that are missing or changed,
// deletes files of songs that were deleted, and writes one .m3u8 file per playlist.
// It reads only the local tables, so it must run after a complete sync. After a
// partial one, songs not yet pulled would look deleted and their files would go.

export interface MirrorState {
  status: 'idle' | 'saving' | 'waitingForWifi' | 'noFolder' | 'folderMissing';
  // Songs finished so far in this run, and how many it set out to save.
  done: number;
  total: number;
  // Size of the songs still to save, or waiting for Wi-Fi.
  bytesLeft: number;
  // Songs that could not be saved. The next run tries them again.
  failed: number;
}

// File URLs last an hour. Small batches keep them fresh on a slow connection.
const URL_BATCH = 25;
const PARALLEL_DOWNLOADS = 3;

let state: MirrorState = { status: 'idle', done: 0, total: 0, bytesLeft: 0, failed: 0 };
const listeners = new Set<() => void>();
let running: Promise<void> | null = null;
let runAgain = false;
let stopping = false;

export function getMirrorState(): MirrorState {
  return state;
}

export function onMirrorState(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function setState(next: Partial<MirrorState>): void {
  state = { ...state, ...next };
  for (const listener of listeners) listener();
}

export function runMirror(): Promise<void> {
  if (running) {
    runAgain = true;
    return running;
  }
  stopping = false;
  running = (async () => {
    try {
      do {
        runAgain = false;
        await mirrorOnce();
      } while (runAgain && !stopping);
    } catch (err) {
      console.warn('Saving songs stopped:', err instanceof Error ? err.message : err);
      setState({ status: 'idle', done: 0, total: 0, bytesLeft: 0 });
    } finally {
      running = null;
    }
  })();
  return running;
}

// Finishes the songs in progress, then stops. Sign-out awaits this before it clears
// the library, so a run never sees the empty tables and deletes every file.
export function stopMirror(): Promise<void> {
  stopping = true;
  runAgain = false;
  return running ?? Promise.resolve();
}

interface WantedRow extends WantedSong {
  sizeBytes: number;
}

interface SavedRow extends SavedSong {
  uri: string;
  coverUri: string | null;
}

async function mirrorOnce(): Promise<void> {
  const root = await getLibraryRoot();
  if (!root) return setState({ status: 'noFolder', done: 0, total: 0, bytesLeft: 0 });
  if (!folderReachable(root)) return setState({ status: 'folderMissing', done: 0, total: 0, bytesLeft: 0 });

  const folderAt = folderLookup(root);
  const [wanted, saved] = await Promise.all([readWantedSongs(), readSavedSongs()]);
  const plan = planSongs(wanted, saved);

  for (const file of plan.remove) {
    if (stopping) return;
    deleteQuietly(file.uri);
    if (file.coverUri) deleteQuietly(file.coverUri);
    await db().runAsync('DELETE FROM saved_songs WHERE song_id = ?', file.songId);
  }
  if (plan.remove.length > 0) notifyLibraryChanged();

  let waiting = false;
  if (plan.save.length > 0) {
    if (await mayDownload()) await saveSongs(plan.save, folderAt);
    else waiting = true;
  }
  if (stopping) return;

  await writePlaylists(folderAt);
  setState(
    waiting
      ? { status: 'waitingForWifi', done: 0, total: plan.save.length, bytesLeft: sumBytes(plan.save) }
      : { status: 'idle', done: 0, total: 0, bytesLeft: 0 },
  );
}

async function saveSongs(items: { song: WantedRow; previous: SavedRow | null }[], folderAt: FolderLookup): Promise<void> {
  let done = 0;
  let failed = 0;
  let bytesLeft = sumBytes(items);
  setState({ status: 'saving', done, total: items.length, bytesLeft, failed });

  for (let i = 0; i < items.length; i += URL_BATCH) {
    if (stopping) return;
    const batch = items.slice(i, i + URL_BATCH);
    const { files } = await api.fileUrls(batch.map((item) => item.song.id));
    const urls = new Map(files.map((file) => [file.songId, file]));

    await forEachInParallel(batch, PARALLEL_DOWNLOADS, async ({ song, previous }) => {
      if (stopping) return;
      const file = urls.get(song.id);
      try {
        // Missing when the song was deleted on the server after the sync. The next sync removes it here.
        if (file) await saveSong(song, previous, file.audioUrl, file.coverUrl, folderAt);
      } catch (err) {
        failed++;
        console.warn(`Could not save ${song.path}:`, err instanceof Error ? err.message : err);
      }
      done++;
      bytesLeft -= song.sizeBytes;
      setState({ done, bytesLeft, failed });
    });
    notifyLibraryChanged();
  }
}

async function saveSong(song: WantedRow, previous: SavedRow | null, audioUrl: string, coverUrl: string | null, folderAt: FolderLookup): Promise<void> {
  const { folders, name } = splitPath(song.path);
  // Downloaded to app storage first: downloads cannot write to a picked folder, and a
  // half-downloaded file never appears in the music folder.
  const staging = new Directory(Paths.cache, 'saving', song.id);
  staging.create({ intermediates: true, idempotent: true });
  try {
    const audio = await File.downloadFileAsync(audioUrl, new File(staging, name), { idempotent: true });
    if ((await audio.digest('SHA-256')) !== song.sha256) throw new Error('The downloaded file is not the one the server described.');

    // Deleted first so a rename that only changes letter case does not collide with the old name.
    if (previous && previous.path !== song.path) deleteQuietly(previous.uri);
    const folder = folderAt(folders);
    // Copying into the folder keeps the file name. Copying onto a file made with
    // createFile() would not: Android may add an extension to it.
    await audio.copy(folder, { overwrite: true });
    const placed = folder.list().find((entry) => entry instanceof File && entry.name === name);
    if (!placed) throw new Error('The file was copied but cannot be found in the music folder.');

    const coverUri = coverUrl ? await saveCover(song, coverUrl) : null;
    if (previous?.coverUri && previous.coverUri !== coverUri) deleteQuietly(previous.coverUri);

    await db().runAsync(
      `INSERT INTO saved_songs (song_id, path, uri, sha256, size_bytes, cover_uri) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (song_id) DO UPDATE SET path = excluded.path, uri = excluded.uri, sha256 = excluded.sha256,
         size_bytes = excluded.size_bytes, cover_uri = excluded.cover_uri`,
      song.id,
      song.path,
      placed.uri,
      song.sha256,
      song.sizeBytes,
      coverUri,
    );
  } finally {
    staging.delete();
  }
}

// Covers stay in app storage, for the app's own screens. The audio file has the cover
// inside it for other players. The name includes the audio hash so a new cover gets a
// new URI, and the image cache never shows the old one.
async function saveCover(song: WantedRow, coverUrl: string): Promise<string> {
  const covers = new Directory(Paths.document, 'covers');
  covers.create({ idempotent: true });
  const cover = await File.downloadFileAsync(coverUrl, new File(covers, `${song.id}-${song.sha256.slice(0, 8)}.jpg`), { idempotent: true });
  return cover.uri;
}

async function writePlaylists(folderAt: FolderLookup): Promise<void> {
  const [wanted, saved] = await Promise.all([
    readWantedPlaylists(),
    db().getAllAsync<SavedPlaylist>('SELECT playlist_id AS playlistId, path, content FROM saved_playlists'),
  ]);
  const plan = planPlaylists(wanted, saved);
  if (plan.write.length === 0 && plan.remove.length === 0) return;

  for (const file of plan.remove) {
    deleteAt(folderAt, file.path);
    await db().runAsync('DELETE FROM saved_playlists WHERE playlist_id = ?', file.playlistId);
  }

  const staging = new Directory(Paths.cache, 'saving', 'playlists');
  staging.create({ intermediates: true, idempotent: true });
  try {
    for (const file of plan.write) {
      if (file.previousPath) deleteAt(folderAt, file.previousPath);
      const { folders, name } = splitPath(file.path);
      const temp = new File(staging, name);
      await temp.write(file.content);
      await temp.copy(folderAt(folders), { overwrite: true });
      await db().runAsync(
        'INSERT INTO saved_playlists (playlist_id, path, content) VALUES (?, ?, ?) ON CONFLICT (playlist_id) DO UPDATE SET path = excluded.path, content = excluded.content',
        file.playlistId,
        file.path,
        file.content,
      );
    }
  } finally {
    staging.delete();
  }
}

async function readWantedSongs(): Promise<WantedRow[]> {
  return db().getAllAsync<WantedRow>(
    `SELECT id, json_extract(data, '$.path') AS path, json_extract(data, '$.audio.sha256') AS sha256,
            json_extract(data, '$.audio.sizeBytes') AS sizeBytes
     FROM songs ORDER BY created_at DESC`,
  );
}

async function readSavedSongs(): Promise<SavedRow[]> {
  return db().getAllAsync<SavedRow>('SELECT song_id AS songId, path, uri, sha256, cover_uri AS coverUri FROM saved_songs');
}

// Playlist files list only songs already saved, so they never point at a missing file.
async function readWantedPlaylists(): Promise<WantedPlaylist[]> {
  const [playlists, entries] = await Promise.all([
    db().getAllAsync<{ id: string; name: string }>('SELECT id, name FROM playlists'),
    db().getAllAsync<{ playlist_id: string; path: string; duration_ms: number; artist: string; title: string }>(
      `SELECT e.playlist_id, f.path, json_extract(s.data, '$.durationMs') AS duration_ms, s.artist, s.title
       FROM entries e
       JOIN songs s ON s.id = e.song_id
       JOIN saved_songs f ON f.song_id = e.song_id
       ORDER BY e.playlist_id, e.position`,
    ),
  ]);
  const byPlaylist = new Map<string, WantedPlaylist['entries']>();
  for (const row of entries) {
    const list = byPlaylist.get(row.playlist_id) ?? [];
    list.push({ path: row.path, durationSec: row.duration_ms / 1000, artist: row.artist, title: row.title });
    byPlaylist.set(row.playlist_id, list);
  }
  return playlists.map((playlist) => ({ id: playlist.id, name: playlist.name, entries: byPlaylist.get(playlist.id) ?? [] }));
}

function sumBytes(items: readonly { song: WantedRow }[]): number {
  return items.reduce((total, item) => total + item.song.sizeBytes, 0);
}

async function mayDownload(): Promise<boolean> {
  const network = await getNetworkStateAsync();
  if (network.type === NetworkStateType.CELLULAR) return getMobileDataAllowed();
  return true;
}

// Fails when the folder was deleted or its access was removed in Android settings.
function folderReachable(root: Directory): boolean {
  try {
    return root.exists;
  } catch {
    return false;
  }
}

type FolderLookup = (folders: readonly string[]) => Directory;

// Finds or creates nested folders. A picked folder has no paths, only listings, so
// each folder is listed once per run and the results are kept. The lookup has no
// await in it: two downloads can never both create the same folder.
function folderLookup(root: Directory): FolderLookup {
  const found = new Map<string, Directory>([['', root]]);
  const listed = new Set<string>();
  return (folders) => {
    let key = '';
    let folder = root;
    for (const name of folders) {
      // Shared storage ignores letter case, so the keys do too.
      const childKey = `${key}/${name.toLowerCase()}`;
      if (!found.has(childKey) && !listed.has(key)) {
        for (const entry of folder.list()) {
          if (entry instanceof Directory) found.set(`${key}/${entry.name.toLowerCase()}`, entry);
        }
        listed.add(key);
      }
      let child = found.get(childKey);
      if (!child) {
        child = folder.createDirectory(name);
        found.set(childKey, child);
      }
      key = childKey;
      folder = child;
    }
    return folder;
  };
}

function deleteAt(folderAt: FolderLookup, path: string): void {
  const { folders, name } = splitPath(path);
  const file = folderAt(folders)
    .list()
    .find((entry) => entry instanceof File && entry.name === name);
  if (file) deleteQuietly(file.uri);
}

// The person may have deleted or moved the file already.
function deleteQuietly(uri: string): void {
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch (err) {
    console.warn(`Could not delete ${uri}:`, err instanceof Error ? err.message : err);
  }
}

async function forEachInParallel<T>(items: readonly T[], limit: number, task: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const item = items[next++] as T;
      await task(item);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}
