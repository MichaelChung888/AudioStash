# 0006. Songs are saved to a music folder the owner picks

Date: 2026-11

## Status

Accepted

## Context

Every song in the library is copied to the phone so it plays offline. The owner wants the files in `Music/AudioStash`, where other music players and a computer connected by USB can see them, and wants them to stay there if AudioStash is uninstalled.

Android limits where an app may write. Since Android 10, an app cannot write to an arbitrary path in shared storage (the part of the phone a USB computer sees) just by asking for the old storage permission. The ways left are:

- **App storage**: a private folder per app. No permission needed. Other apps cannot see it, and Android deletes it when the app is uninstalled.
- **MediaStore**: Android's index of media files. An app can add audio files to `Music/` through it without a permission, and owns the files it adds.
- **Storage Access Framework (SAF)**: the owner picks a folder in a system screen, and the app gets lasting permission to read and write everything inside it. Files are named by `content://` URIs, not paths.
- **All files access** (`MANAGE_EXTERNAL_STORAGE`): read and write anywhere. The owner must turn it on in system settings.

## Decision

On first run the app asks where songs should go:

1. **A folder in Music** (recommended). The SAF picker opens in `Music`. Picking `Music` or any folder not called AudioStash creates `AudioStash` inside it.
2. **Inside AudioStash only**. App storage, for owners who do not want files elsewhere.

The library is mirrored into that folder. Mirroring means making the folder match the library: save songs that are missing or changed, delete files of songs that left the library, and write one `.m3u8` playlist file per playlist. The planning step compares what the library wants with a `saved_songs` table by path and SHA-256 hash. It is a pure function, tested without a phone.

Rules the mirror follows:

- It runs only after a complete sync. It reads only the local database, and after a partial sync songs not yet pulled would look deleted and their files would go.
- Each file is downloaded to the app's cache, its SHA-256 hash checked against the server's, then copied into the folder. A half-downloaded file never appears in the music folder, and a wrong file is never saved.
- Over mobile data it waits for Wi-Fi, unless the owner allows mobile data in settings.
- Playlist files list only songs already saved, so they never point at a missing file.
- Covers are kept in app storage for AudioStash's own screens. The audio file has the cover inside it for other players.

## Options considered

| Option           | Why it lost                                                                                                                                                                               |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| App storage only | Other players and a computer cannot see the files, and uninstalling deletes them. Kept as the second choice.                                                                              |
| MediaStore       | After a reinstall the app no longer owns the files it added, and Android asks the owner to approve each change to them. Renaming or deleting songs would show a system prompt every time. |
| All files access | Gives AudioStash every file on the phone when it needs one folder. The owner must find the setting by hand, and Google Play refuses most apps that ask for it.                            |

## Consequences

- Files survive an uninstall. After reinstalling, the owner picks the same folder. The record of saved files went with the app's database, so every song is downloaded again and written over the file with the same name. The folder ends with one copy of each song.
- Signing out keeps the record of saved files, so signing in again downloads nothing that is already saved.
- SAF has no paths. Finding `Songs/Dua Lipa/Houdini.opus` means listing each folder in turn, so the mirror lists each folder once per run and keeps the results. Shared storage ignores letter case, so lookups do too.
- Copying a file into a SAF folder can be slow on some phones. Three downloads run at once to keep the connection busy.
- If the owner deletes the folder or removes AudioStash's access in Android settings, the mirror stops. The Downloads tab says "The music folder cannot be reached. Choose it again", and tapping it opens the folder choice.
- Changing the folder leaves the old files where they are and saves every song again in the new folder.
- Folders left empty after their last song is deleted are not removed.

## Where the code is

- [apps/mobile/src/files/library-folder.ts](../../apps/mobile/src/files/library-folder.ts): choosing the folder
- [apps/mobile/src/files/plan.ts](../../apps/mobile/src/files/plan.ts): what to save, replace and delete
- [apps/mobile/src/files/mirror.ts](../../apps/mobile/src/files/mirror.ts): doing it
- [docs/learning/android-storage.md](../learning/android-storage.md): how Android storage works, in more depth
