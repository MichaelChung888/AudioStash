# 0002. Jobs go to RabbitMQ through an outbox table

Date: 2026-11

## Status

Accepted

## Context

When the owner asks for a download, the API writes rows to Postgres: the download and its items. It must also put a job on RabbitMQ so the worker starts. RabbitMQ is a message broker: a server that holds queues of messages until a program takes them.

Jobs are created in several places: creating a download, retrying one, and the worker reporting the songs it found at a playlist link ([apps/api/src/services/downloads.ts](../../apps/api/src/services/downloads.ts), [apps/api/src/services/download-items.ts](../../apps/api/src/services/download-items.ts)).

Postgres and RabbitMQ cannot commit together. Whatever order the API uses, a failure between the two steps leaves them disagreeing:

- Publish after the database commit. If the API process stops between the two steps, or RabbitMQ is down, the download is saved but no job exists. It never runs.
- Publish before the commit. If the transaction then rolls back, the worker gets a job for rows that do not exist.

## Decision

Jobs are written to an `outbox` table in the same transaction as the rows they belong to. An outbox table is a list of messages waiting to be sent, kept in the same database as the data. A loop in the API called the relay sends them to RabbitMQ afterwards ([packages/db/src/schema.ts](../../packages/db/src/schema.ts), [apps/api/src/outbox/relay.ts](../../apps/api/src/outbox/relay.ts)).

1. A service calls `enqueue(tx, jobs)` inside its transaction ([apps/api/src/db/outbox.ts](../../apps/api/src/db/outbox.ts)). The rows and the job are saved together, or neither is.
2. After the commit, the service calls `relay.kick()`, which starts publishing at once.
3. The relay also checks the table every second. This catches a job that a kick missed, for example after a crash right after the commit, or while RabbitMQ was down.
4. The relay locks up to 100 unpublished rows with `FOR UPDATE SKIP LOCKED`. `SKIP LOCKED` leaves out rows another relay has locked instead of waiting for them.
5. It publishes the rows in order. For each one it waits for RabbitMQ to confirm it stored the message (a publisher confirm), then sets `published_at`.
6. If a publish fails, it records `attempts` and `last_error` on the row and stops the batch. The next check tries again.
7. Published rows are deleted after seven days.

[CLAUDE.md](../../CLAUDE.md) makes this a rule: never publish straight to RabbitMQ inside a request.

## Options considered

| Option                                                | Why it lost                                                                                                                                                                                                                                                                           |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Publish to RabbitMQ in the request, after the commit  | A crash between the commit and the publish, or RabbitMQ being down, leaves a saved download with no job.                                                                                                                                                                              |
| Publish to RabbitMQ in the request, before the commit | A rollback after the publish sends the worker a job for rows that do not exist.                                                                                                                                                                                                       |
| No RabbitMQ: the worker asks the API for queued items | The API would have to rebuild what the queues in [packages/messaging](../../packages/messaging/src/topology.ts) give: retries after 30 seconds, 2 minutes and 10 minutes; a dead queue that holds jobs that failed every attempt; and redelivery of a job a stopped worker had taken. |

## Consequences

- A download can be created while RabbitMQ is down. Its job is published when RabbitMQ is back.
- A job can be published twice. If the API stops after RabbitMQ confirms a message but before `published_at` is saved, the next check publishes it again. RabbitMQ also delivers at least once: a message can arrive twice, for example when the worker stops after the work but before acknowledging it ([packages/messaging/src/jobs.ts](../../packages/messaging/src/jobs.ts)).
- So every worker call to the API is idempotent: calling it twice has the same effect as calling it once. An item can be claimed again. A repeated completion returns the first result. A job for a removed or cancelled item gets a "skip" or 409 answer, and the worker stops ([apps/api/src/services/worker-jobs.ts](../../apps/api/src/services/worker-jobs.ts), [apps/worker/src/api/client.ts](../../apps/worker/src/api/client.ts)).
- Each row keeps one `message_id`, sent as the RabbitMQ message id. A row published twice goes out with the same id both times.
- Each service that creates a job must do it inside its transaction and call `relay.kick()` after the commit. If the kick is left out, the job still goes out within a second.
- Several API processes can run the relay at once. `SKIP LOCKED` stops two of them publishing the same row in the same pass.
- Watch for: rows go out in `id` order, and a failure stops the batch. A row that keeps failing holds back every row after it. Its `attempts` and `last_error` columns show this.

[apps/api/src/services/downloads.int.test.ts](../../apps/api/src/services/downloads.int.test.ts) checks that creating a download writes its job to the outbox and kicks the relay.
