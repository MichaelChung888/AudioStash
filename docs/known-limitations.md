# Known limitations

Things Pluck does not do yet, or does in a simple way on purpose. Each entry says what happens and why it was left.

## Not tried on a phone yet

The app passes type checks, unit tests, lint, and builds its Android bundle. It has not run on a phone, because no Android tools are installed where it was written. Audio, the folder picker, background playback and lock screen controls are checked only by installing the APK.

## The APK needs the API on https

A release build refuses plain `http://` (see [Expo, and how the app becomes an APK](learning/expo-and-the-apk.md)). The API running in Docker on the PC is `http://`, so the APK cannot use it. The cloud deploy, which is next, gives the API an `https://` address.

## App

| What happens                                                                                                                                | Why it was left                                                                                                |
| ------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| The queue is not saved. If Android closes the app, nothing is playing on the next launch.                                                   | Saving it means restoring the native playlist and position on start-up. Worth doing once the basics are tried. |
| Only songs saved on the phone play. A song still being saved is shown but cannot be tapped.                                                 | Streaming from storage would need a second playback path and works only online.                                |
| Starting a download needs a connection. Offline, the add sheet shows an error and the owner tries again later.                              | The worker is on the PC and needs the API anyway. Queuing downloads on the phone adds little.                  |
| If Android closes the app while the add sheet is open, the sheet closes on return. See [ADR 0008](adr/0008-add-sheet-request-in-memory.md). | One tap repeats it. Nothing was sent.                                                                          |
| An edit the server rejects is undone on the phone with no message. See [ADR 0005](adr/0005-local-database-on-the-phone.md).                 | Happens only when two phones edit the same playlist at once.                                                   |
| Edits not yet sent when you sign out are lost.                                                                                              | Sign-out waits for a sync already running, but does not start one.                                             |

## Music folder

| What happens                                                                                                 | Why it was left                                                                                                           |
| ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| Artist folders left empty after their last song is deleted stay in the music folder.                         | Harmless, and checking every folder after each deletion is slow on Android's folder access.                               |
| Deleting an old playlist file creates its folder if you had deleted that folder by hand.                     | The folder lookup always creates missing folders. The result is one empty folder.                                         |
| After uninstalling and reinstalling, every song is downloaded again and written over the file already there. | The record of saved files is in the app's database, which uninstalling deletes. See [ADR 0006](adr/0006-music-folder.md). |
| Changing the music folder leaves the files in the old one.                                                   | Deleting a folder of music on the owner's behalf is riskier than leaving it.                                              |
