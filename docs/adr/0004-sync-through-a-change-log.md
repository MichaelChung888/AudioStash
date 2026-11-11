# 0004. Phones sync through a change log read with a cursor

Date: 2026-11

## Status

Accepted

## Context

The phone keeps a copy of the whole library, so everything plays offline ([README.md](../../README.md)). The copy is a SQLite database on the phone ([ADR 0005](0005-local-database-on-the-phone.md)). The library also changes on the server, where the phone cannot see it:

- the worker adds songs;
- another phone edits or deletes songs and playlists;
- a download adds songs to a playlist.

The phone must find every change since it last synced, deletes included, even after days offline. It must also send the edits it made offline.

The live event stream cannot carry the changes. It is open only while the app is on screen ([apps/mobile/src/session.ts](../../apps/mobile/src/session.ts)), and its events are not stored ([apps/api/src/services/notifier.ts](../../apps/api/src/services/notifier.ts)).

## Decision

**The change log.** `library_changes` is an append-only table: rows are added and never changed. Each row names one changed record (`entity` is song, playlist or entry, plus `entity_id`), the operation (`upsert` or `delete`; upsert means "created or updated"), and `seq`, a number that increases with each row ([packages/db/src/schema.ts](../../packages/db/src/schema.ts)). It holds no row data.

- Every transaction that changes songs, playlists or playlist entries calls `recordChanges` as its last statement ([apps/api/src/db/changes.ts](../../apps/api/src/db/changes.ts)).
- `recordChanges` first takes a Postgres advisory lock, a lock on an agreed number rather than on a row, held until the transaction ends. So writers to the log commit one at a time. Without it, `seq` 11 could commit before `seq` 10. A phone could read 11, move past it, and never receive 10.

**Pull.** The cursor is the highest `seq` the phone has applied, stored on the phone. `GET /v1/sync/pull?cursor=N` returns up to 500 changes after N, the new cursor, and `hasMore`, which is true when more changes are waiting ([apps/api/src/services/sync.ts](../../apps/api/src/services/sync.ts), [packages/contracts/src/sync.ts](../../packages/contracts/src/sync.ts)).

- The API reads the log page and the changed rows in one repeatable-read transaction. That is a snapshot: every read sees the database as it was at the first read, so the rows match the page.
- A record changed several times in a page is sent once, as it is now. An upsert whose row is gone is sent as a delete.

**Push.** The phone saves each offline edit as a mutation, an edit described as a message, in its own SQLite `outbox` table. This is separate from the API's outbox in [ADR 0002](0002-jobs-through-an-outbox.md). `POST /v1/sync/push` applies the mutations in order. Each has an id the phone generated, and the `applied_mutations` table records it, so a resent mutation has no effect.

**The loop.** [apps/mobile/src/sync/engine.ts](../../apps/mobile/src/sync/engine.ts) pushes, then pulls until `hasMore` is false. It applies each page and saves the new cursor in one SQLite transaction. Pushing first means the pull brings back the phone's own edits as the server stored them. A sync starts when the event stream opens, when the network comes back, after a local edit, and on a `library.changed` event.

## Options considered

| Option                                             | Why it lost                                                                                                                                                                    |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Send the whole library on every sync               | Each sync would download every song, playlist and entry, even when nothing changed.                                                                                            |
| Ask for rows with `updated_at` after the last sync | A deleted row leaves nothing to find, so deletes would never reach the phone. A transaction that commits late can also carry an earlier time than rows the phone already read. |
| Send changes only over the live event stream       | The stream is open only while the app is on screen, and events are not stored. A phone would miss every change made while the app was closed.                                  |

## Consequences

- A phone offline for weeks catches up page by page from its cursor. If a sync stops halfway, nothing is lost: the cursor is saved in the same transaction as its page.
- Deletes reach the phone as their own changes. Deleting a song or playlist also logs a delete for each of its entries, so the phone never relies on cascading deletes.
- Every transaction that changes library rows must call `recordChanges`, as its last statement ([CLAUDE.md](../../CLAUDE.md)). A change it leaves out never reaches any phone. Taking row locks after it can deadlock.
- Writers to the log commit one at a time. That suits one owner's edits and downloads.
- If the server rejects a mutation, for example an add to a playlist another phone deleted, the phone pulls from cursor 0 and replaces its local tables with the server's state.
- Watch for: nothing deletes old rows from `library_changes` or `applied_mutations`. Both grow with every change. A new phone, or a phone pulling from cursor 0, reads the whole log.

[apps/api/src/services/sync.int.test.ts](../../apps/api/src/services/sync.int.test.ts) covers paging with the cursor, resent mutations, and deletes for a playlist's entries.
