# 0008. The add sheet receives its request in memory, not in the URL

Date: 2026-11

## Status

Accepted

## Context

Every way of adding music ends in the same sheet, at the route `/add`. It shows what will be downloaded, the format and extras, and where the songs go (the library, a playlist, or a new playlist). It opens from:

- a download button on a chart or search row (one or more songs, with their title, artist, album and cover);
- a YouTube video in search results;
- a pasted link, already parsed into its source and kind;
- files picked from the phone (names, sizes, `content://` URIs).

Expo Router passes data to a screen as route parameters, which become part of the URL. Parameters are strings. A list of songs or picked files does not fit well in a URL, and a `content://` URI inside another URI needs careful escaping.

Android may close a backgrounded app to free memory. When the owner returns, Android restores the screen stack from the URLs, but anything held only in memory is gone.

## Decision

`openAddSheet(request)` stores the request in a module variable and opens `/add`. The sheet reads it with `getAddRequest()`. The request is a typed union with one shape per source, so the sheet handles each one explicitly.

If the sheet opens and there is no request, it closes itself.

The sheet also fixes two ids when it first opens: the download id and, when the target is a new playlist, the playlist id. The server treats a repeated create with the same id as the same download. Pressing Download again after a failed request cannot create a second download or a second playlist.

The playlist picker is a view inside the sheet, not a separate screen, so no state has to cross from one screen to another.

## Options considered

| Option                                      | Why it lost                                                                                                                                                      |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| JSON in a route parameter                   | Long, escaped URLs. Picked files hold `content://` URIs that would be escaped twice. Types are lost at the boundary and must be checked again on the other side. |
| Write the request to SQLite or storage      | Survives Android closing the app, but adds cleanup for requests never finished. A lost request costs the owner one tap to repeat.                                |
| Pass ids only, and fetch again in the sheet | Chart and search results are not stored anywhere to fetch again by id, and picked files have no id at all.                                                       |

## Consequences

- Opening the sheet from anywhere is one call with a typed argument.
- If Android closes the app while the sheet is open, the sheet closes on return and the owner taps the download button again. Nothing has been sent at that point, so nothing is lost on the server.
- Only one request is held at a time. That matches the interface: only one sheet is open at a time.

## Where the code is

- [apps/mobile/src/downloads/add-request.ts](../../apps/mobile/src/downloads/add-request.ts): the handoff
- [apps/mobile/src/app/add.tsx](../../apps/mobile/src/app/add.tsx): the sheet
