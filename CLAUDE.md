# Pluck

Personal music library: Android app (Expo), API (Hono, cloud), download worker (home PC). See README.md for the architecture and docs/adr for the decisions behind it.

## Commands

- `pnpm lint`, `pnpm typecheck`, `pnpm test` must pass before a change is done.
- `pnpm test:integration` needs Docker (Testcontainers).
- `pnpm db:generate` after editing `packages/db/src/schema.ts`. Nothing is deployed yet, so the schema still lives in one migration, `0000_init.sql`: delete `packages/db/drizzle` and regenerate with `--name init` rather than adding migrations.

## TypeScript without a build

Node 24 runs the `.ts` files directly by removing the types. So:

- Only erasable syntax: no `enum`, no `namespace`, no constructor parameter properties.
- Relative imports end in `.ts`. Type-only imports use `import type` or `type` inline.
- Workspace packages export `./src/index.ts`. Node refuses to strip types under `node_modules`, so never copy workspace packages into `node_modules` (no `pnpm deploy`).

## API layout

`routes` (paths, validation, middleware) → `controllers` (read the request, call a service, shape the response) → `services` (rules, transactions) → `db` (one query per function, `Executor` as the first argument). `context.ts` is the only place that reads the environment and creates connections.

- Services throw `AppError` subclasses from `lib/errors.ts`. Only `app.ts` turns errors into HTTP responses.
- In a transaction that locks both, lock the download row before its item rows.
- `recordChanges` is the last statement in a transaction that changes library rows.
- Jobs are published through the outbox table, never straight to RabbitMQ inside a request.
- Clerk is reached only through `services/clerk.ts`. Phones send Clerk session tokens; the worker sends `WORKER_TOKEN`.

## Worker

- It talks to the API only through `/v1/worker/*`, and every call is safe to repeat.
- `ApiError.isGone` (404 or 409) means the item is no longer wanted: stop quietly.
- Throw `PermanentJobError` for failures a retry cannot fix.
- Spawn tools with an argument array, never through a shell.

## Mobile app

- Android only. No Android SDK here: check changes with `pnpm --filter @pluck/mobile bundle` as well as typecheck, test and lint. Native behaviour is only checked on a phone.
- Screens read the local SQLite database through queries under `keys.local`. Library edits go through `src/db/mutations.ts`, which applies the edit locally and queues it in the outbox in one transaction. Never send a library edit to the API directly.
- The mirror (`src/files/mirror.ts`) deletes files of songs missing from the local database, so it runs only after a complete sync (`onSynced`).
- The sign-out order in `src/session.ts` matters: stop the mirror, stop playback, sign out, wait for sync, clear the library.
- The player in `src/player/player.ts` is a module-level singleton. Create the native player only when something plays. Only components that show a moving position use `usePlaybackStatus`.
- Write each `process.env.EXPO_PUBLIC_*` out in full; Metro replaces only the literal text. Never put a secret in one.
- Database migrations in `src/db/database.ts` are append-only.
- Unit tests cover modules with no React Native imports. Put logic worth testing in such a module.

## Writing

- Short, plain sentences. No invented shorthand.
- Comment only what the code cannot say: a non-obvious reason, a trap, outside context.
- Learning notes in `docs/learning` define every term and give the reason for every claim.
