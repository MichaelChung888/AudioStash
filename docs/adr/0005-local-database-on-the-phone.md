# 0005. The phone keeps the library in SQLite and edits it offline

Date: 2026-11

## Status

Accepted

## Context

AudioStash's songs live on the phone so they play with no connection. The library around them must work offline too: the list of songs, the playlists, their order, and edits such as renaming a playlist on a train.

The server is the source of truth. It keeps a change log, and phones catch up by reading it from a cursor (see [0004](0004-sync-through-a-change-log.md)). The phone needs somewhere to keep what it has read, and a way to make edits before the server has seen them.

Constraints:

- One owner, possibly on more than one phone. Edits from two phones are rare but possible.
- A library of a few thousand songs. Screens sort and filter it, and the music folder code joins songs to playlists.
- The server's song and playlist shapes will gain fields over time.

## Decision

The phone keeps a SQLite database, opened with `expo-sqlite`. SQLite is a database stored in a single file, with no server process.

- **Tables hold the server's JSON.** Each song and playlist row stores the server's object in a `data` column, plus the few columns the screens sort or search by. A new server field reaches the screens without a migration on the phone.
- **Edits are applied locally first.** An edit, such as adding songs to a playlist, changes the local tables and appends a record to an `outbox` table in the same transaction. A transaction is a group of writes that all happen or none do, so the screen and the outbox never disagree. An outbox is a table of pending messages, sent later in the order they were written.
- **Sync pushes, then pulls.** The sync engine sends the outbox to `POST /v1/sync/push`, then reads the change log after its cursor. Pushing first means the pull brings back the phone's own edits as the server stored them.
- **Each edit has an id.** The server applies an edit id only once, so sending the same outbox twice after a dropped connection does no harm. An operation that is safe to repeat like this is called idempotent.
- **A rejected edit causes a full reload.** For example, adding a song to a playlist that another phone deleted. The phone has already applied it locally, so it sets a `resync` flag and the next pull replaces the whole library with the server's copy.
- **Screens read the database through React Query.** Queries under the `['local']` key read SQLite. Every committed change calls `notifyLibraryChanged()`, which marks those queries stale so the screens reload.

## Options considered

| Option                                   | Why it lost                                                                                                                                                                                          |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fetch from the API on every screen       | Nothing works offline, which is the main reason the app exists.                                                                                                                                      |
| Persist React Query's cache to storage   | The cache holds whole responses, not rows. Joining songs to playlists, sorting thousands of songs, and keeping edits in order would all be done by hand in memory.                                   |
| One column per server field              | Every new server field would need a migration on the phone, and old app versions would drop fields they do not know.                                                                                 |
| A sync library (WatermelonDB, PowerSync) | WatermelonDB needs its own native module and its own backend protocol. PowerSync's server is a paid service or another container to run. AudioStash's needs are one table of changes and one outbox. |
| Last-writer-wins merging on the phone    | Merging needs timestamps per field and rules per edit. With one owner, conflicts are rare enough that "the server's copy wins" is simpler and always correct.                                        |

## Consequences

- The app opens and plays with no connection. Edits made offline are sent on the next sync.
- An edit the server rejects is undone on the phone without a message. With one owner this happens only when two phones edit the same playlist at once.
- The database schema is a list of migrations in `src/db/database.ts`. A migration that has shipped must never be edited; add a new one.
- Signing out deletes the library tables and the outbox, but keeps the record of saved files. Signing in again pulls the library and finds the songs already on the phone, so nothing is downloaded twice. Edits still in the outbox at sign-out are lost.

## Where the code is

- [apps/mobile/src/db/database.ts](../../apps/mobile/src/db/database.ts): tables and migrations
- [apps/mobile/src/db/mutations.ts](../../apps/mobile/src/db/mutations.ts): every edit, applied locally and queued
- [apps/mobile/src/sync/engine.ts](../../apps/mobile/src/sync/engine.ts): push, pull, resync
