# 0001. Downloads run on a home PC, not in the cloud

Date: 2026-11

## Status

Accepted

## Context

Pluck downloads songs from YouTube, SoundCloud and Bandcamp links with yt-dlp, converts them with ffmpeg, tags them, and uploads them to Cloudflare R2. R2 is Cloudflare's file storage. It accepts the same requests as Amazon S3.

The constraints at the time:

- Everything must run on free tiers. The API is planned for a free cloud server ([README.md](../../README.md)).
- YouTube blocks most requests from cloud servers ([README.md](../../README.md)). A worker on the same server as the API would fail on most YouTube links.
- The owner has a Windows PC at home that runs Docker. It is not always on.

## Decision

The download worker runs in Docker on the owner's home PC. The API, Postgres and RabbitMQ run on the cloud server.

- The worker joins the owner's Tailscale network and connects out to the server. Tailscale is a private network between the owner's machines. Each machine gets a `100.x.y.z` address that only machines on that network can reach. So RabbitMQ and the API's worker routes need no public address, and the PC opens no port to the internet ([deploy/worker/compose.yaml](../../deploy/worker/compose.yaml), [apps/worker/src/env.ts](../../apps/worker/src/env.ts)).
- The worker takes jobs from RabbitMQ. It changes state only by calling the API's `/v1/worker/*` routes, never by connecting to Postgres ([apps/api/src/services/worker-jobs.ts](../../apps/api/src/services/worker-jobs.ts)).
- It uploads files to R2 through presigned URLs from the API. A presigned URL is a link the API signs that allows one upload to one storage key for a limited time, here one hour. So the PC holds no database password and no storage keys. It holds `WORKER_TOKEN` and the RabbitMQ login only (see [ADR 0003](0003-clerk-for-one-owner.md)).
- yt-dlp, ffmpeg and the Python tagging script are installed in the worker's Docker image, so the PC needs only Docker ([apps/worker/Dockerfile](../../apps/worker/Dockerfile)).

## Options considered

| Option                                                            | Why it lost                                                                                                           |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Run the worker on the cloud server, next to the API               | YouTube blocks most requests from cloud servers, so most YouTube downloads would fail.                                |
| Run everything (API, Postgres, RabbitMQ, worker) on the home PC   | The PC is sometimes asleep or off. The phone could not sync or queue a download at those times.                       |
| Worker on the PC, connecting to public RabbitMQ and API addresses | RabbitMQ and the worker routes would be reachable from the whole internet. Over Tailscale neither needs to be public. |

## Consequences

Easier:

- Downloads come from the PC's home connection, not from a cloud server's address.
- The phone fetches song files from R2 directly, not from the PC. Playback and file downloads keep working while the PC is off.
- If the PC is compromised, it exposes `WORKER_TOKEN` and the RabbitMQ login, not the database or the storage keys.

Harder:

- Downloads run only while the PC is on. The worker sends a heartbeat every 30 seconds. The API marks it offline after 90 seconds without one ([apps/api/src/realtime/worker-status.ts](../../apps/api/src/realtime/worker-status.ts)). The add screen then tells the owner the download will start when the PC is back online ([apps/mobile/src/app/add.tsx](../../apps/mobile/src/app/add.tsx)).
- Jobs wait in RabbitMQ while the PC is off. A job the worker had taken but not finished when it stopped was never acknowledged, so RabbitMQ delivers it again after a restart ([apps/worker/src/index.ts](../../apps/worker/src/index.ts)). This is one reason every worker call must be safe to repeat ([ADR 0002](0002-jobs-through-an-outbox.md)).
- There are two machines to run, and two `.env` files that must hold the same `WORKER_TOKEN`.

Watch for:

- YouTube can still ask the PC to confirm it is not a bot. `YTDLP_COOKIES_FILE` takes a cookies file from a signed-in browser for that case, and for age-restricted videos.
- Processing more songs at once adds load on YouTube and makes rate limiting more likely. `WORKER_CONCURRENCY` defaults to 2 and allows at most 8.
