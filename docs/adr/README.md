# Architecture decision records

An architecture decision record (ADR) is a short note about one decision: what was decided, why, and what it costs. It is written when the decision is made and not edited afterwards. When a decision changes, a new record replaces the old one, and the old one's status says so. The reasons stay readable even after the code has moved on.

| Number                                      | Decision                                                     | Status   |
| ------------------------------------------- | ------------------------------------------------------------ | -------- |
| [0001](0001-downloads-run-on-a-home-pc.md)  | Downloads run on a home PC, not in the cloud                 | Accepted |
| [0002](0002-jobs-through-an-outbox.md)      | Jobs go to RabbitMQ through an outbox table                  | Accepted |
| [0003](0003-clerk-for-one-owner.md)         | Clerk for sign-in, with an allow-list of one                 | Accepted |
| [0004](0004-sync-through-a-change-log.md)   | Phones sync through a change log read with a cursor          | Accepted |
| [0005](0005-local-database-on-the-phone.md) | The phone keeps the library in SQLite and edits it offline   | Accepted |
| [0006](0006-music-folder.md)                | Songs are saved to a music folder the owner picks            | Accepted |
| [0007](0007-one-player-outside-react.md)    | One audio player for the whole app, kept outside React       | Accepted |
| [0008](0008-add-sheet-request-in-memory.md) | The add sheet receives its request in memory, not in the URL | Accepted |

## Format

Each record has these parts:

- **Status**: Proposed, Accepted, or Replaced by a later number.
- **Context**: the problem and the constraints, as they were at the time.
- **Decision**: what was chosen, in a few sentences.
- **Options considered**: the alternatives, and why each lost.
- **Consequences**: what gets easier, what gets harder, and what to watch for.

Number new records in order and add them to the table above.
