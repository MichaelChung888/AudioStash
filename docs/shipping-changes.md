# Shipping changes, and looking after production

This is for after the first deploy. [Deploying AudioStash](deploy.md) sets everything up once; this note covers getting each change to production, and keeping production healthy.

You keep developing exactly as now: the local Docker stack and the emulator. Production only changes when you deploy.

## Shipping a change

1. Check and push:

   ```powershell
   pnpm lint
   pnpm typecheck
   pnpm test
   git push
   ```

   GitHub Actions (CI) runs the same checks, the integration tests and both image builds on every push. Wait for a green tick before deploying.

2. Deploy each part you changed:

   | You changed                   | Run                                                                                                               |
   | ----------------------------- | ----------------------------------------------------------------------------------------------------------------- |
   | `apps/api` or `packages/*`    | `ssh ubuntu@audiostash "cd AudioStash && git pull && docker compose -f deploy/server/compose.yaml up -d --build"` |
   | `apps/worker` or `packages/*` | On the PC: `git pull`, then `docker compose -f deploy/worker/compose.yaml up -d --build`                          |
   | `apps/mobile` or `packages/*` | `pnpm mobile:release`, then install the APK on the phone                                                          |

   The API is down for a few seconds while its container restarts. The app retries, and jobs wait in RabbitMQ, so nothing is lost. New database migrations run on their own before the API starts.

   To install the APK, either connect the phone over USB and run `adb install -r apps\mobile\android\app\build\outputs\apk\release\app-release.apk`, or send the file to the phone any way you like (Quick Share, Google Drive, a message to yourself) and open it there. The signature is inside the file, so Android checks the same key however it arrives. Each new APK installs over the last and keeps the library.

## Rules that start with the first deploy

- **Migrations only grow.** Until now the schema was regenerated as one `0000_init.sql`. Once production has data, never edit or regenerate a migration that has run there. Change `schema.ts`, run `pnpm db:generate`, and commit the new file. Update the migration rule in `CLAUDE.md` when you deploy.
- **The server goes first.** The phone keeps the old app until you install the new APK, so the API must still accept what the old app sends. Deploy the API, then the app. The same applies to the worker: deploy the API, then the worker.
- **Old images pile up.** Every build leaves the previous image behind. Run `docker image prune -f` on the server now and then.

## Looking after it

- **Logs:** `docker compose -f deploy/server/compose.yaml logs -f api` on the server. Old log files are deleted automatically.
- **RabbitMQ's web UI:** run `ssh -L 15672:localhost:15672 ubuntu@audiostash` on your PC, then open `http://localhost:15672`. The UI listens only on the server's localhost, and `-L` carries it through SSH to your PC.
- **Backups:** Postgres holds the library: which songs, playlists and edits exist. R2 holds the files. If the server's disk is lost, the library goes with it, although the files survive. There are no automatic backups yet. Until there are, take a copy now and then:

  ```powershell
  ssh ubuntu@audiostash "cd AudioStash && docker compose -f deploy/server/compose.yaml exec -T postgres pg_dump -U audiostash audiostash" > audiostash-backup.sql
  ```

- **Server updates:** Ubuntu installs security updates on its own. Run `sudo apt upgrade` now and then for the rest.

## Later

### Faster app updates

Each app change currently needs a full build and an install. [EAS Update](https://docs.expo.dev/eas-update/introduction/) can send JavaScript-only changes straight to the installed app, which picks them up the next time it opens. Changes to native code (a new Expo module, `app.config.ts` plugins, an Expo SDK upgrade) still need a build. Setting it up means adding `expo-updates` and making one new build. It is worth it once you change the app often.

### Automatic deploys

CI already checks every push. CD (continuous deployment) would also run the deploy command when CI passes on `main`. A GitHub Actions job can join your tailnet with [Tailscale's GitHub Action](https://tailscale.com/kb/1276/tailscale-github-action) and run the same `ssh` command. For one person, running the command yourself is simpler, and you choose when production changes. Add CD when that stops being true. The worker cannot be deployed this way, because the PC is not always on.
