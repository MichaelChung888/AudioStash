# Deploying AudioStash, and shipping changes

This puts AudioStash on the internet so the installed app works anywhere, like a real product. It has three parts, as in the [architecture diagram](architecture.svg):

| Where          | What runs there             | How it gets there                                 |
| -------------- | --------------------------- | ------------------------------------------------- |
| A cloud server | The API, Postgres, RabbitMQ | `deploy/server/compose.yaml`, built on the server |
| Your home PC   | The download worker         | `deploy/worker/compose.yaml`, built on the PC     |
| Your phone     | The app                     | An APK built by EAS Build, installed from a link  |

Song files go to Cloudflare R2, and sign-in stays with Clerk.

The first deploy takes an evening. After that, shipping a change is one or two commands ([Shipping changes](#shipping-changes)).

## Tools and accounts

| What                                                   | Used for                                                                                  | Cost                                          |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------- | --------------------------------------------- |
| A cloud server ([choose one](#choose-a-server))        | Runs the API, Postgres and RabbitMQ in Docker                                             | Free (Oracle) or about €4–5 a month (Hetzner) |
| [Tailscale](https://tailscale.com)                     | A private network between the server and your PC, and the API's public `https://` address | Free Personal plan                            |
| [Cloudflare R2](https://developers.cloudflare.com/r2/) | Stores the song files                                                                     | Free up to 10 GB, about 2,000 songs           |
| [Clerk](https://clerk.com)                             | Sign-in. You already have it                                                              | Free                                          |
| [Expo](https://expo.dev) (EAS Build)                   | Builds the APK on Expo's servers                                                          | Free, 30 builds a month                       |
| GitHub                                                 | The server and the PC pull the code from it                                               | Free                                          |
| Docker                                                 | Runs everything on the server and the PC                                                  | Free                                          |

Words used below:

- **Tailnet**: your Tailscale network. Each machine on it gets a `100.x.y.z` address that only your other machines can reach.
- **Tailscale Funnel**: gives one port on a machine a public `https://<machine>.<tailnet>.ts.net` address, with a certificate Tailscale manages. The phone uses it to reach the API. You need no domain name and open no port on the server.
- **Tailscale Serve**: the same, but reachable only from your tailnet. The worker uses it to reach the API and RabbitMQ.
- **SSH**: a remote terminal on the server. `ssh ubuntu@audiostash` opens one.

## How the parts reach each other

```text
phone ──https──> Funnel (port 443, public) ──> localhost:3000   API
PC worker ──tailnet──> Serve (port 3000) ────> localhost:3000   API
PC worker ──tailnet──> Serve (port 5672) ────> localhost:5672   RabbitMQ
```

Docker publishes every port on `127.0.0.1` only, so nothing on the server listens on the internet except SSH and Funnel. Binding to `0.0.0.0` would be unsafe even behind a firewall, because Docker writes its own firewall rules that go around it.

Funnel publishes the whole API, including the worker's `/v1/worker/*` routes. Those routes refuse any request without `WORKER_TOKEN`, a 48-byte random secret, so this is safe. Hiding them from the public address completely needs a code change, which has not been made yet.

## Choose a server

Any server running Ubuntu 24.04 with at least 2 GB of memory works. Arm and x86 both work, because the images are built on the server.

| Option                                                                    | For                                    | Against                                                                                                                                                                            |
| ------------------------------------------------------------------------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Oracle Cloud Always Free](https://www.oracle.com/cloud/free/), Ampere A1 | Free. 2 CPUs and 12 GB of memory       | Oracle can stop a free server that stays mostly idle for 7 days, and a personal API is mostly idle. Sign-up needs a card. New servers are sometimes "out of capacity" in a region. |
| [Hetzner Cloud](https://www.hetzner.com/cloud/) CAX11                     | Reliable. 2 Arm CPUs, 4 GB, 40 GB disk | About €4–5 a month                                                                                                                                                                 |

Start with Oracle if staying free matters most. If Oracle stops the server, start it again from the Oracle console; if that keeps happening, move to Hetzner. The steps are the same on both.

## Part 1: Cloudflare R2

1. Sign up at [dash.cloudflare.com](https://dash.cloudflare.com) and open **R2 Object Storage**. Cloudflare may ask for a payment method before it turns R2 on, even for the free allowance.
2. **Create bucket**, named `audiostash`. Leave the location on automatic.
3. Copy the **S3 API** address from the R2 overview page: `https://<account id>.r2.cloudflarestorage.com`. Leave off the bucket name if it shows one. This is `S3_ENDPOINT`.
4. **Manage API tokens > Create API token**. Choose **Object Read & Write** and apply it to the `audiostash` bucket only. Copy the **Access Key ID** and **Secret Access Key**. Cloudflare shows the secret once.

## Part 2: The server

### 1. Create it

On Oracle: **Compute > Instances > Create instance**.

- **Name:** anything, for example `audiostash-server`. Tailscale gets its own name for it later.
- **Image:** Canonical Ubuntu 24.04.
- **Shape:** **Virtual machine > Ampere > VM.Standard.A1.Flex**, with 2 OCPUs and 12 GB of memory. Check it says **Always Free-eligible**. The other shapes either cost money or have only 1 GB.
- **Networking:** make the network first, in a second browser tab: **Networking > Virtual cloud networks > Start VCN Wizard > Create VCN with Internet Connectivity**, keeping its defaults. Back in the instance form, choose that VCN and its **public** subnet, then turn on **Automatically assign public IPv4 address**: the server needs it to reach the internet and for your first SSH login. Leave IPv6 off. The form can also create a network itself, but then it will not let you turn on the public address.
- **SSH keys:** choose **Generate a key pair for me** and download both keys into `%USERPROFILE%\.ssh`. Oracle cannot show the private key again.
- **Boot volume** and **Security:** leave the defaults.

If creating fails with "Out of capacity", try another availability domain (AD), or try again later. The user name is `ubuntu`.

On Hetzner:

- **Add server**, Ubuntu 24.04, type CAX11, add your SSH public key. Also create a **Firewall** that allows only SSH (port 22) in, and attach it. The user name is `root`, so write `root@` wherever this guide says `ubuntu@`.

Then, from PowerShell on your PC:

```powershell
ssh -i $env:USERPROFILE\.ssh\<the key file> ubuntu@<the server's public IP>
```

Type `yes` when it asks whether to trust the server. The prompt changes to something like `ubuntu@audiostash-server:~$`. From here on, that PowerShell window is a terminal on the server: every command you type runs there, not on your PC. "On the server" in this guide means in that window. `exit` brings you back to your PC.

### 2. Install Docker and Tailscale

On the server:

```bash
sudo apt update && sudo apt upgrade -y
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER

curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up --ssh --hostname audiostash
```

| Command                                             | What it does                                                                                                                                                                                                            |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sudo apt update && sudo apt upgrade -y`            | `apt` is Ubuntu's software installer. `update` refreshes the list of available versions, and `upgrade -y` installs every pending update without asking. If a purple screen asks which services to restart, press Enter. |
| `curl -fsSL https://get.docker.com \| sudo sh`      | Downloads Docker's official install script and runs it as administrator.                                                                                                                                                |
| `sudo usermod -aG docker $USER`                     | Adds your user to the `docker` group, so `docker` works without `sudo`. It applies from your next login only.                                                                                                           |
| `curl -fsSL https://tailscale.com/install.sh \| sh` | Downloads and runs Tailscale's install script.                                                                                                                                                                          |
| `sudo tailscale up --ssh --hostname audiostash`     | Joins the server to your tailnet, under the name `audiostash`.                                                                                                                                                          |

`sudo` runs a command as administrator. Installing software and changing system settings need it.

**Then type `exit` and SSH in again.** Until you do, every `docker` command fails with "permission denied while trying to connect to the docker API", because the group change has not applied yet. `groups` should now list `docker`.

`tailscale up` prints a link. Open it and sign in to add the server to your tailnet. `--ssh` turns on Tailscale SSH, so you can reach the server by name over the tailnet without the key file.

In the [Tailscale admin console](https://login.tailscale.com/admin/machines), open the `audiostash` machine's menu and choose **Disable key expiry**. Otherwise the server drops off your tailnet after 180 days, and the worker loses it.

Install the [Tailscale app for Windows](https://tailscale.com/download/windows) on your PC too, and sign in with the same account. From now on you connect with:

```powershell
ssh ubuntu@audiostash
```

Tailscale may ask you to confirm in the browser the first time. Once this works, you can remove the SSH rule from the cloud firewall, so SSH is reachable only over your tailnet.

### 3. Get the code and fill in the settings

```bash
git clone https://github.com/MichaelChung888/AudioStash.git
cd AudioStash
cp deploy/server/.env.example deploy/server/.env
chmod 600 deploy/server/.env

openssl rand -hex 24      # run twice: POSTGRES_PASSWORD and RABBITMQ_PASSWORD
openssl rand -base64 48   # WORKER_TOKEN
nano deploy/server/.env
```

This works because the repository is public. A private one needs a login, and GitHub refuses account passwords for git: give the server a read-only [deploy key](https://docs.github.com/en/authentication/connecting-to-github-with-ssh/managing-deploy-keys#deploy-keys) and clone with the `git@github.com:` address instead.

The comments in [deploy/server/.env.example](../deploy/server/.env.example) say where each value comes from. Use a new `WORKER_TOKEN`, not the one from your local `.env`, so the local setup can never talk to production.

`chmod 600` lets only your user read the file, because it holds the secrets.

### 4. Start it

```bash
docker compose -f deploy/server/compose.yaml up -d --build
```

The first build takes a few minutes. Then:

```bash
docker compose -f deploy/server/compose.yaml ps      # api should say "healthy"
curl http://127.0.0.1:3000/ready                     # "status":"ok", with each check true
```

`restart: unless-stopped` in the Compose file starts everything again after a reboot.

### 5. Give it an address

```bash
sudo tailscale funnel --bg 3000
sudo tailscale serve --bg --tcp=3000 tcp://localhost:3000
sudo tailscale serve --bg --tcp=5672 tcp://localhost:5672
tailscale serve status
tailscale ip -4
```

| Command                                                     | What it does                                                                                                                                                                                                             |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `sudo tailscale funnel --bg 3000`                           | Opens `https://audiostash.<your tailnet>.ts.net` to the whole internet and passes each request to port 3000 on the server, where the API listens. Tailscale provides the HTTPS certificate. This is the phone's address. |
| `sudo tailscale serve --bg --tcp=3000 tcp://localhost:3000` | Makes port 3000 reachable at the server's private `100.x` address, from your own machines only. The worker calls the API this way.                                                                                       |
| `sudo tailscale serve --bg --tcp=5672 tcp://localhost:5672` | The same for RabbitMQ, so the worker can take jobs. It is never public.                                                                                                                                                  |
| `tailscale serve status`                                    | Lists the three rules above, to check they are set.                                                                                                                                                                      |
| `tailscale ip -4`                                           | Prints the server's `100.x.y.z` address, for the worker's `.env` on your PC.                                                                                                                                             |

- `sudo` runs a command as administrator, which changing Tailscale's settings needs.
- `--bg` keeps each rule after you close SSH, and after a reboot.
- The first `funnel` command prints a link to turn on HTTPS and Funnel for your tailnet. Open it and approve.

These commands only connect addresses to ports. They start nothing, so the API must already be running from step 4.

Open `https://audiostash.<your tailnet>.ts.net/ready` in your phone's browser, with Wi-Fi turned off. It should show `"status":"ok"`. The first request can take a few seconds while Tailscale gets the certificate. The address alone, with no path, answers 404, because the API has no page at `/`.

If the browser shows **502 Bad Gateway**, Tailscale is working but nothing answered on port 3000: the API is not running. Check it with `docker compose -f deploy/server/compose.yaml ps` and read its log with `docker compose -f deploy/server/compose.yaml logs api --tail 30`. An API that keeps restarting usually has a missing or malformed value in `deploy/server/.env`; the log names it. After fixing `.env`, run `docker compose -f deploy/server/compose.yaml up -d`, not `restart`, because a container reads `.env` only when it is created.

## Part 3: The worker on your PC

1. In the Tailscale admin console, **Settings > Keys > Generate auth key**. The defaults are fine, but leave **Ephemeral** off: an ephemeral machine is removed from the tailnet soon after it goes offline, which happens every time the PC sleeps.

   The key is used once. On its first start, the `tailscale` container signs in with it and keeps its login in a Docker volume; later starts use that login and ignore the key. Once `audiostash-worker` shows in the admin console, you can blank `TS_AUTHKEY` in `.env`. You need a new key only if that volume is deleted, for example by `docker compose down -v` or by resetting Docker Desktop.

   The container is its own machine on the tailnet, separate from the Tailscale app on your PC. The app lets you reach the server; the container lets the worker reach it.
2. In the repository on your PC:

   ```powershell
   copy deploy\worker\.env.example deploy\worker\.env
   ```

   Fill in `TS_AUTHKEY`, the server's `100.x.y.z` address in `API_URL` and `RABBITMQ_URL`, the server's `RABBITMQ_PASSWORD`, and the same `WORKER_TOKEN` as the server.

3. Start it:

   ```powershell
   docker compose -f deploy/worker/compose.yaml up -d --build
   docker compose -f deploy/worker/compose.yaml logs -f worker
   ```

   Wait for `worker started`, then press Ctrl+C. Ctrl+C only stops watching the log; the worker keeps running.

4. In the Tailscale admin console, choose **Disable key expiry** for the new `audiostash-worker` machine too.
5. In Docker Desktop, **Settings > General**, turn on **Start Docker Desktop when you sign in**. The worker then comes back on its own after the PC restarts.

The local development stack (`pnpm docker:up`) can keep running alongside it. It has its own RabbitMQ, so the two never share jobs.

## Part 4: The app on your phone

1. If the phone has a build from `pnpm run mobile:dev`, uninstall it first. It is signed with a different key, so Android refuses to install the APK over it.
2. Follow [The Android app](../README.md#the-android-app) in the README. In step 2, set `EXPO_PUBLIC_API_URL` to `https://audiostash.<your tailnet>.ts.net`, with no `/` at the end.
3. Sign in, choose where songs go, and download a song. The Downloads screen should show the PC online, and the song should reach your library within a minute or two.

Clerk stays on its development instance (`pk_test_` and `sk_test_` keys), and that is fine for one person. A production Clerk instance needs a domain name you own. The `ts.net` address belongs to Tailscale, so it does not count.

## Settings, by place

| Place                          | Settings                                                                                                                                                                                        |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Server, `deploy/server/.env`   | `POSTGRES_PASSWORD`, `RABBITMQ_PASSWORD`, `CLERK_SECRET_KEY`, `CLERK_ALLOWED_USER_IDS`, the five `S3_*` values, `WORKER_TOKEN`. Optional: `CLERK_JWT_KEY`, `YOUTUBE_API_KEY`, `CATALOG_COUNTRY` |
| PC, `deploy/worker/.env`       | `TS_AUTHKEY`, `API_URL`, `RABBITMQ_URL`, `WORKER_TOKEN`. Optional: `WORKER_CONCURRENCY`                                                                                                         |
| EAS, set with `eas env:create` | `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`. Optional: `EXPO_PUBLIC_CHART_COUNTRY`                                                                                               |

The two `.env` files stay on their machines and are never committed. The EAS values are built into the APK, so none of them may be a secret.

## Shipping changes

You keep developing exactly as now: the local Docker stack and the emulator. Production only changes when you deploy.

1. Check and push:

   ```powershell
   pnpm lint
   pnpm typecheck
   pnpm test
   git push
   ```

   GitHub Actions (CI) runs the same checks, the integration tests and both image builds on every push. Wait for a green tick before deploying.

2. Deploy each part you changed:

   | You changed                   | Run                                                                                                                                       |
   | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
   | `apps/api` or `packages/*`    | `ssh ubuntu@audiostash "cd AudioStash && git pull && docker compose -f deploy/server/compose.yaml up -d --build"`                         |
   | `apps/worker` or `packages/*` | On the PC: `git pull`, then `docker compose -f deploy/worker/compose.yaml up -d --build`                                                  |
   | `apps/mobile`                 | `cd apps/mobile`, then `npx eas-cli build --platform android --profile preview`. Open the link on the phone and install over the old app. |

   The API is down for a few seconds while its container restarts. The app retries, and jobs wait in RabbitMQ, so nothing is lost. New database migrations run on their own before the API starts.

Rules that start with the first deploy:

- **Migrations only grow.** Until now the schema was regenerated as one `0000_init.sql`. Once production has data, never edit or regenerate a migration that has run there. Change `schema.ts`, run `pnpm db:generate`, and commit the new file. Update the migration rule in `CLAUDE.md` when you deploy.
- **The server goes first.** The phone keeps the old app until you install the new APK, so the API must still accept what the old app sends. Deploy the API, then the app. The same applies to the worker: deploy the API, then the worker.
- **Old images pile up.** Every build leaves the previous image behind. Run `docker image prune -f` on the server now and then.

### Faster app updates, later

Each app change currently needs a full EAS build: several minutes in the queue, then an install. [EAS Update](https://docs.expo.dev/eas-update/introduction/) can send JavaScript-only changes straight to the installed app, which picks them up the next time it opens. Changes to native code (a new Expo module, `app.config.ts` plugins, an Expo SDK upgrade) still need a build. Setting it up means adding `expo-updates` and making one new build. It is worth it once you change the app often.

### Automatic deploys, later

CI already checks every push. CD (continuous deployment) would also run the deploy command when CI passes on `main`. A GitHub Actions job can join your tailnet with [Tailscale's GitHub Action](https://tailscale.com/kb/1276/tailscale-github-action) and run the same `ssh` command. For one person, running the command yourself is simpler, and you choose when production changes. Add CD when that stops being true. The worker cannot be deployed this way, because the PC is not always on.

## Looking after it

- **Logs:** `docker compose -f deploy/server/compose.yaml logs -f api` on the server. Old log files are deleted automatically.
- **RabbitMQ's web UI:** run `ssh -L 15672:localhost:15672 ubuntu@audiostash` on your PC, then open `http://localhost:15672`. The UI listens only on the server's localhost, and `-L` carries it through SSH to your PC.
- **Backups:** Postgres holds the library: which songs, playlists and edits exist. R2 holds the files. If the server's disk is lost, the library goes with it, although the files survive. There are no automatic backups yet. Until there are, take a copy now and then:

  ```powershell
  ssh ubuntu@audiostash "cd AudioStash && docker compose -f deploy/server/compose.yaml exec -T postgres pg_dump -U audiostash audiostash" > audiostash-backup.sql
  ```

- **Server updates:** Ubuntu installs security updates on its own. Run `sudo apt upgrade` now and then for the rest.
