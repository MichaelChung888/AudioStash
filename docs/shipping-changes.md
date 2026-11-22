# Shipping changes

This is for after the first deploy. [Deploying AudioStash](deploy.md) sets everything up once; this note covers getting each change to production.

You keep developing exactly as now: the local Docker stack and the emulator. Production changes when you push to `main` and CI passes, so push to `main` only what you want running.

## Shipping a change

1. Check and push:

   ```powershell
   pnpm lint
   pnpm typecheck
   pnpm test
   git push
   ```

   GitHub Actions (CI) runs the same checks, the integration tests and both image builds on every push.

2. The server and the worker update themselves. When every check passes on `main`, CI's Release job marks the commit as released, and each machine picks it up:

   | Part                         | How it updates                                                                                                                                                        | When                                                        | Deploy by hand                                                                                                               |
   | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
   | Server: API, Postgres, queue | Release moves the `release` branch to the commit. Every two minutes the server checks the branch, then rebuilds and restarts what changed (`deploy/server/update.sh`) | A few minutes after the Release job, depending on the build | `ssh -t ubuntu@audiostash sudo systemctl start audiostash-update`                                                            |
   | Worker on your PC            | Release publishes a new worker image. Every five minutes the `updater` container downloads it and restarts the worker on it                                           | Within five minutes, or five minutes after the PC wakes     | `docker compose -f deploy/worker/compose.yaml pull worker`, then `docker compose -f deploy/worker/compose.yaml up -d worker` |
   | App on the phone             | Only by hand                                                                                                                                                          | When you install it                                         | `pnpm mobile:release`, then install the APK (step 3)                                                                         |

   Deploy by hand when you don't want to wait for the next check, or while updates are paused. It deploys the same thing the machines would: the newest commit that passed CI, never one that didn't. The server's command waits until the deploy ends and prints any error. `-t` lets `sudo` ask for your password if the server needs one.

   A change to only the app, or to only the docs, still makes a release. Docker reuses its cached build, so nothing restarts.

   The API is down for a few seconds while its container restarts. The app retries, and jobs wait in RabbitMQ, so nothing is lost. New database migrations run on their own before the API starts. The worker waits up to 25 seconds for the songs it is working on, and any it cannot finish go back to the queue.

3. If you changed the app, install the new APK. Either connect the phone over USB and run `adb install -r apps\mobile\android\app\build\outputs\apk\release\app-release.apk`, or send the file to the phone any way you like (Quick Share, Google Drive, a message to yourself) and open it there. The signature is inside the file, so Android checks the same key however it arrives. Each new APK installs over the last and keeps the library.

## Watching an update

The Release job in GitHub's **Actions** tab turns green once the commit is released. Then:

| Part   | Command                                                                  | Shows                                                                    |
| ------ | ------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| Server | `ssh ubuntu@audiostash journalctl -u audiostash-update -f`               | `Deploying <commit>`, the build, then `Deployed <commit>`                |
| Worker | `docker compose -f deploy/worker/compose.yaml logs -f updater` on the PC | `Recreated` when the worker restarted on a new image, every five minutes |

`journalctl` reads the log systemd keeps for each service; `-u` picks the service, and `-f` keeps printing new lines until Ctrl+C.

## When an update fails

- **CI fails.** Nothing is released, and both machines keep what they run. Fix it and push again.
- **The server's build fails.** The old containers keep running, because Compose replaces them only after the build. The journal shows the error.
- **The new API does not become healthy.** It has already replaced the old one, so the API is down. The journal shows `Deploying` with no `Deployed` after it; `docker compose -f deploy/server/compose.yaml logs api --tail 50` on the server says why.

The server retries a failed update every two minutes, so a passing failure, such as a network error during the build, fixes itself. For a broken commit, undo it and push:

```powershell
git revert <commit>
git push
```

`git revert` makes a new commit that undoes the old one, so it goes through CI and out like any other change. `systemctl status audiostash-update` on the server shows whether its last run failed.

## Later

### Faster app updates

Each app change currently needs a full build and an install. [EAS Update](https://docs.expo.dev/eas-update/introduction/) can send JavaScript-only changes straight to the installed app, which picks them up the next time it opens. Changes to native code (a new Expo module, `app.config.ts` plugins, an Expo SDK upgrade) still need a build. Setting it up means adding `expo-updates` and making one new build. It is worth it once you change the app often.
