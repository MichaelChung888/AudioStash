# 0003. Clerk for sign-in, with an allow-list of one

Date: 2026-11

## Status

Accepted

## Context

The API will run on a cloud server with a public address. It must refuse requests from anyone but the owner. AudioStash has one owner, and everything must use free tiers.

The phone needs a sign-in screen, and the owner needs a way to sign out one device, for example a lost phone. The download worker also calls the API, but it is a program on the home PC with nobody there to sign it in.

[docs/learning/auth.md](../learning/auth.md) explains every part of this in full. This record keeps only the decision and its reasons.

## Decision

- Clerk, a hosted sign-in service, handles sign-in on the phone. The app signs in with an email and password, or with Google, Apple, GitHub or Facebook through Clerk; a forgotten password is reset with a code Clerk emails ([apps/mobile/src/app/sign-in.tsx](../../apps/mobile/src/app/sign-in.tsx)). Clerk stores the account, the password and the sessions; AudioStash stores no passwords.
- The phone sends a Clerk session token with each request. A session token is a JWT: a token that carries its own facts (such as the user id) and a signature over them. It expires about a minute after Clerk issues it. The API checks the signature with Clerk's public key, without calling Clerk.
- Two independent checks keep strangers out. Clerk's sign-up mode is Restricted, so nobody can create an account. The API also answers 403 to any user id not in `CLERK_ALLOWED_USER_IDS`, which holds only the owner's id ([apps/api/src/services/auth.ts](../../apps/api/src/services/auth.ts)).
- A signed-in device is a Clerk session. Signing a device out through the API revokes its session at Clerk, and the API refuses that session's tokens for five minutes, longer than any of them can live.
- The worker sends `WORKER_TOKEN`, one long random string the API and the worker both hold. Worker routes refuse session tokens, and app routes refuse the worker token ([apps/api/src/middleware/auth.ts](../../apps/api/src/middleware/auth.ts)).
- Only [apps/api/src/services/clerk.ts](../../apps/api/src/services/clerk.ts) talks to Clerk.

## Options considered

| Option                                            | Why it lost                                                                                                                                                |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Build sign-in into the API                        | AudioStash would store accounts, send sign-in emails and keep a table of devices. Clerk does all of this on its free plan.                                 |
| One shared secret on the phone, like the worker's | A leaked secret works until it is changed on both sides. A leaked session token stops working within a minute. One secret also cannot sign out one device. |
| Clerk's Restricted sign-up mode alone             | If that dashboard setting were changed by mistake, a stranger could create an account and get a valid token. The allow-list still refuses them.            |
| Clerk sessions for the worker too                 | The worker has no sign-in screen, and nobody is there to sign it in again when a session ends.                                                             |
| A users table and per-user data from the start    | Every query would filter by a `user_id` column, for users AudioStash does not have.                                                                        |

## Consequences

- Checking a token makes no network call once the API has Clerk's public key. Setting `CLERK_JWT_KEY` gives it the key directly.
- A device signed out in the Clerk dashboard is locked out within a minute, because Clerk will not issue it a new token. A device signed out through the API is refused at once.
- The list of revoked sessions is kept in the API process's memory. This works because AudioStash runs one API process. A second process would accept a revoked session's tokens until they expire, up to a minute.
- Live event streams check the token once, when they open. So revoking a session also closes its streams.
- `WORKER_TOKEN` does not expire. If it leaks, it must be changed on the server and on the PC.
- Adding more users later means a users table, a `user_id` column on songs, playlists and downloads, a filter on every query, and removing the allow-list. [docs/learning/auth.md](../learning/auth.md) lists the steps.
