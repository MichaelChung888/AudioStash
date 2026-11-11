import { type DownloadOptions, downloadOptionsSchema } from '@pluck/contracts';
import type { SQLiteDatabase } from 'expo-sqlite';
import { db } from './database.ts';

type SettingKey =
  // Sequence number of the last change pulled from the server.
  | 'cursor'
  // Set when the server rejected an edit: the next pull starts again from zero.
  | 'resync'
  | 'libraryFolder'
  | 'mobileData'
  | 'downloadOptions';

export async function getSetting(key: SettingKey, executor: SQLiteDatabase = db()): Promise<string | null> {
  const row = await executor.getFirstAsync<{ value: string }>('SELECT value FROM settings WHERE key = ?', key);
  return row?.value ?? null;
}

export async function setSetting(key: SettingKey, value: string, executor: SQLiteDatabase = db()): Promise<void> {
  await executor.runAsync('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value', key, value);
}

export async function deleteSetting(key: SettingKey, executor: SQLiteDatabase = db()): Promise<void> {
  await executor.runAsync('DELETE FROM settings WHERE key = ?', key);
}

export async function getDefaultDownloadOptions(): Promise<DownloadOptions> {
  const stored = await getSetting('downloadOptions');
  const parsed = downloadOptionsSchema.safeParse(stored ? JSON.parse(stored) : {});
  return parsed.success ? parsed.data : downloadOptionsSchema.parse({});
}

export async function setDefaultDownloadOptions(options: DownloadOptions): Promise<void> {
  await setSetting('downloadOptions', JSON.stringify(options));
}

export async function getMobileDataAllowed(): Promise<boolean> {
  return (await getSetting('mobileData')) === 'on';
}
