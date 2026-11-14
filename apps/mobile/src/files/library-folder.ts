import { Directory, Paths } from 'expo-file-system';
import { db, notifyLibraryChanged } from '../db/database.ts';
import { getSetting, setSetting } from '../db/settings.ts';
import { folderLabel } from './folder-label.ts';

// Where songs are saved. Either a folder the person picked in shared storage, so
// other music apps and a computer can see the files, or the app's own storage.
// The setting holds the picked folder's URI, or APP_STORAGE. Unset means not chosen
// yet, and nothing is saved until it is.

const FOLDER_NAME = 'AudioStash';
const APP_STORAGE = 'app';
// Opens the picker in the phone's Music folder.
const MUSIC_FOLDER_URI = 'content://com.android.externalstorage.documents/document/primary%3AMusic';

export type LibraryFolder = { kind: 'shared'; label: string } | { kind: 'app' };

export async function getLibraryFolder(): Promise<LibraryFolder | null> {
  const value = await getSetting('libraryFolder');
  if (value === null) return null;
  return value === APP_STORAGE ? { kind: 'app' } : { kind: 'shared', label: folderLabel(value) };
}

export async function getLibraryRoot(): Promise<Directory | null> {
  const value = await getSetting('libraryFolder');
  if (value === null) return null;
  if (value !== APP_STORAGE) return new Directory(value);
  const root = new Directory(Paths.document, FOLDER_NAME);
  root.create({ idempotent: true });
  return root;
}

// Returns false when the person closes the picker. Picking Music (or any folder
// not called AudioStash) saves into an AudioStash folder inside it.
export async function chooseSharedFolder(): Promise<boolean> {
  let picked: Directory;
  try {
    picked = await Directory.pickDirectoryAsync(MUSIC_FOLDER_URI);
  } catch (err) {
    if ((err as { code?: string }).code === 'ERR_PICKER_CANCELLED') return false;
    throw err;
  }
  const root = picked.name === FOLDER_NAME ? picked : childFolder(picked, FOLDER_NAME);
  await changeFolder(root.uri);
  return true;
}

export async function chooseAppStorage(): Promise<void> {
  await changeFolder(APP_STORAGE);
}

// Files in the old folder are left alone. Every song is saved again in the new one.
async function changeFolder(value: string): Promise<void> {
  if ((await getSetting('libraryFolder')) === value) return;
  await db().withExclusiveTransactionAsync(async (tx) => {
    await setSetting('libraryFolder', value, tx);
    await tx.execAsync('DELETE FROM saved_songs; DELETE FROM saved_playlists;');
  });
  notifyLibraryChanged();
}

// Android's folder access has no paths, so a child is found by listing its parent.
// Names are compared ignoring case because shared storage ignores case.
export function childFolder(parent: Directory, name: string): Directory {
  const lower = name.toLowerCase();
  const existing = parent.list().find((entry): entry is Directory => entry instanceof Directory && entry.name.toLowerCase() === lower);
  return existing ?? parent.createDirectory(name);
}
