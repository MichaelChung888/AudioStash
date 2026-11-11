import { describe, expect, it } from 'vitest';
import { folderLabel } from './folder-label.ts';

describe('folderLabel', () => {
  it('shows a folder inside a picked tree', () => {
    expect(folderLabel('content://com.android.externalstorage.documents/tree/primary%3AMusic/document/primary%3AMusic%2FPluck')).toBe('Music/Pluck');
  });

  it('shows a picked tree', () => {
    expect(folderLabel('content://com.android.externalstorage.documents/tree/primary%3AMusic%2FPluck')).toBe('Music/Pluck');
  });

  it('marks folders on an SD card', () => {
    expect(folderLabel('content://com.android.externalstorage.documents/tree/1A2B-3C4D%3AMusic')).toBe('SD card/Music');
  });
});
