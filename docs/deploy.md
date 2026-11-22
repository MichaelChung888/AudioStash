# Deploying AudioStash

This puts AudioStash on the internet so the installed app works anywhere, like a real product. It has three parts, as in the [architecture diagram](architecture.svg):

| Where          | What runs there             | How it gets there                                                                        |
| -------------- | --------------------------- | ---------------------------------------------------------------------------------------- |
| A cloud server | The API, Postgres, RabbitMQ | `deploy/server/compose.yaml`, built on the server, which updates itself from GitHub      |
| Your home PC   | The download worker         | `deploy/worker/compose.yaml`, running the image CI publishes, which the PC keeps updated |
| Your phone     | The app                     | A release APK built on your PC, installed over USB                                       |

Song files go to Cloudflare R2, and sign-in stays with Clerk.

The first deploy takes an evening. After that, the server and the worker update themselves each time CI passes on `main`, and only the app needs a build ([Shipping changes](shipping-changes.md)).

## Tools and accounts

| What                                                   | Used for                                                                                  | Cost                                          |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------- | --------------------------------------------- |
| A cloud server ([choose one](#choose-a-server))        | Runs the API, Postgres and RabbitMQ in Docker                                             | Free (Oracle) or about €4–5 a month (Hetzner) |
| [Tailscale](https://tailscale.com)                     | A private network between the server and your PC, and the API's public `https://` address | Free Personal plan                            |
| [Cloudflare R2](https://developers.cloudflare.com/r2/) | Stores the song files                                                                     | Free up to 10 GB, about 2,000 songs           |
| [Clerk](https://clerk.com)                             | Sign-in. You already have it                                                              | Free                                          |
| Android Studio                                         | Builds and signs the APK on your PC. You already have it from the emulator                | Free                                          |
| GitHub                                                 | Checks each push. The server pulls the code, and the PC the worker image, from it         | Free                                          |
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
# apt is Ubuntu's software installer. `update` refreshes the list of available versions,
# and `upgrade -y` installs every pending update without asking.
# If a purple screen asks which services to restart, press Enter.
sudo apt update && sudo apt upgrade -y

# Downloads Docker's official install script and runs it as administrator.
curl -fsSL https://get.docker.com | sudo sh

# Adds your user to the docker group, so `docker` works without sudo.
# It applies from your next login only.
sudo usermod -aG docker $USER

# Downloads and runs Tailscale's install script.
curl -fsSL https://tailscale.com/install.sh | sh

# Joins the server to your tailnet, under the name audiostash.
sudo tailscale up --ssh --hostname audiostash
```

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

The server deploys itself. Every two minutes it checks the `release` branch, which CI moves to each commit that passes every check on `main`, and deploys any new commit ([update.sh](../deploy/server/update.sh)). **systemd**, the program that starts Ubuntu's services, runs the check. Turn it on:

```bash
# systemd reads its settings from /etc/systemd/system.
sudo cp deploy/server/audiostash-update.service deploy/server/audiostash-update.timer /etc/systemd/system/
sudo systemctl daemon-reload

# Starts the timer now, and on every boot.
sudo systemctl enable --now audiostash-update.timer

# Shows the deploys as they run. Ctrl+C stops watching.
journalctl -u audiostash-update -f
```

Within two minutes it shows `Deploying`, the build, which takes a few minutes the first time, then `Deployed`. Then:

```bash
docker compose -f deploy/server/compose.yaml ps      # api should say "healthy"
curl http://127.0.0.1:3000/ready                     # "status":"ok", with each check true
```

- The `release` branch exists once CI has passed on `main`. If the log says it cannot find `release`, check **Actions** on GitHub.
- The service expects the code in `/home/ubuntu/AudioStash`, as in step 3.
- The code there now sits on the released commit instead of a branch, so never `git pull` there.

### 5. Give it an address

```bash
# Opens https://audiostash.<your tailnet>.ts.net to the whole internet and passes each
# request to port 3000 on the server, where the API listens. Tailscale provides the
# HTTPS certificate. This is the phone's address.
sudo tailscale funnel --bg 3000

# Makes port 3000 reachable at the server's private 100.x address, from your own
# machines only. The worker calls the API this way.
sudo tailscale serve --bg --tcp=3000 tcp://localhost:3000

# The same for RabbitMQ, so the worker can take jobs. It is never public.
sudo tailscale serve --bg --tcp=5672 tcp://localhost:5672

# Lists the three rules above, to check they are set.
tailscale serve status

# Prints the server's 100.x.y.z address, for the worker's .env on your PC.
tailscale ip -4
```

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
   docker compose -f deploy/worker/compose.yaml up -d
   docker compose -f deploy/worker/compose.yaml logs -f worker
   ```

   Wait for `worker started`, then press Ctrl+C. Ctrl+C only stops watching the log; the worker keeps running.

   The PC builds nothing. It downloads the worker image that CI published to the GitHub Container Registry (GHCR) the last time every check passed on `main`. The `updater` container started with it checks for a newer image every five minutes, and restarts the worker on it. It never changes your repository folder, so your own work there is safe.

   If the download fails with `denied` or `unauthorized`, GitHub made the image private. Open your GitHub profile, then **Packages > audiostash-worker > Package settings**, and under **Danger Zone** change the visibility to **Public**. The code is public already, so this shows nothing new. A private image would need a GitHub login on the PC.

4. In the Tailscale admin console, choose **Disable key expiry** for the new `audiostash-worker` machine too.
5. In Docker Desktop, **Settings > General**, turn on **Start Docker Desktop when you sign in**. The worker then comes back on its own after the PC restarts.

The local development stack (`pnpm docker:up`) can keep running alongside it. It has its own RabbitMQ, so the two never share jobs.

## Part 4: The app on your phone

The app is built on your PC as a **release APK**: the app's JavaScript is packed inside, so it runs on its own, and it is signed with your own key. Building on your PC needs Android Studio, which the emulator already needed, and has no monthly limit. [EAS Build](https://docs.expo.dev/build/introduction/) builds on Expo's servers instead, with no Android tools but 30 builds a month. Pick one and stay with it, for the reason in step 1.

### 1. Make the signing key, once

Android installs an update only if it is signed with the same key as the app already installed. The key lives in a **keystore** file. Android Studio includes `keytool`, which makes one:

```powershell
# A folder for the key in your user folder, outside every project, so git never sees it.
mkdir $env:USERPROFILE\.android-keys

# keytool comes with Android Studio's copy of Java. `&` tells PowerShell to run the
# program at this quoted path.
#   -genkeypair          make a new key pair: a private key that signs, and a public key
#                        that Android uses to check the signature
#   -v                   print what it did
#   -storetype PKCS12    the standard keystore format
#   -keystore "…"        the file to create
#   -alias audiostash    the key's name inside the file; Gradle asks for the key by it
#   -keyalg RSA          the kind of key
#   -keysize 2048        its strength in bits; 2048 is the standard minimum
#   -validity 10000      days until the certificate's date runs out, about 27 years
& "C:\Program Files\Android\Android Studio\jbr\bin\keytool.exe" -genkeypair -v `
  -storetype PKCS12 -keystore "$env:USERPROFILE\.android-keys\audiostash.jks" `
  -alias audiostash -keyalg RSA -keysize 2048 -validity 10000
```

It asks for a few things:

- **A password**, at least 6 characters. Use a long one from a password manager. Avoid backslashes, because step 2 writes the password into a file where a backslash means something else. A PKCS12 keystore uses this one password for both the file and the key.
- **Your name, organisation, city and so on.** These only label the certificate, and anyone can read them from the APK, so put nothing private. Pressing Enter at each leaves it as "Unknown", which works. At the end, type `yes` to confirm.

Android does not check the expiry date when it installs an update; it only checks that the key matches.

**Back it up now.** Save `audiostash.jks` and its password in a password manager. Without them you can never update the app again: you would uninstall it, which deletes its library, and start over with a new key. Keep the file outside the repository.

### 2. Tell Gradle where the key is, once

**Gradle** is Android's build tool. It reads `gradle.properties` in your user folder for every build. Create or open `%USERPROFILE%\.gradle\gradle.properties` and add:

```properties
AUDIOSTASH_STORE_FILE=C:/Users/<you>/.android-keys/audiostash.jks
AUDIOSTASH_STORE_PASSWORD=<the password>
AUDIOSTASH_KEY_ALIAS=audiostash
AUDIOSTASH_KEY_PASSWORD=<the same password>
```

Use forward slashes in the path, because a backslash is an escape character in this file. The file is outside every project, so the password never reaches git.

[apps/mobile/plugins/release-signing.ts](../apps/mobile/plugins/release-signing.ts) makes release builds use these values. Expo generates the `android` folder from `app.config.ts`, so the setup is added there rather than edited by hand. A release build without these values stops with an error instead of making an APK that will not install.

### 3. Give the build its settings, once

Create `apps/mobile/.env.release`:

```bash
EXPO_PUBLIC_API_URL=https://audiostash.<your tailnet>.ts.net
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
EXPO_PUBLIC_CHART_COUNTRY=gb
```

No `/` at the end of the address. Your `apps/mobile/.env` points at your PC for development; the release build reads `.env.release` instead. Git ignores both. Every value is built into the APK, where anyone with the file can read it, so none may be a secret.

### 4. Build

```powershell
pnpm mobile:release
```

[apps/mobile/scripts/build-release.mts](../apps/mobile/scripts/build-release.mts):

1. Checks the settings: the API address must start with `https://`, because a release build refuses plain `http`.
2. Sets the **version code** to the number of commits on the branch. Android refuses to install a lower version code over a higher one, and the commit count only grows.
3. Runs `expo prebuild --clean`, which deletes the `android` folder and writes it again from `app.config.ts`. Starting clean means a permission or plugin removed from the config does not linger in the app.
4. Runs Gradle's `assembleRelease`, which bundles the JavaScript, compiles the native code and signs the APK. The native code is built for arm64 only, the processor in every current Android phone, which keeps the APK small and the build shorter.

The first build takes 10 minutes or more; later ones are faster. It ends by printing where the APK is: `apps/mobile/android/app/build/outputs/apk/release/app-release.apk`.

### 5. Install it

The first time only: uninstall any AudioStash already on the phone, from `pnpm mobile:dev` or EAS. Those are signed with other keys, so Android refuses to install over them. Uninstalling deletes the app's library on the phone; it syncs again after you sign in.

Then get the APK onto the phone. Either way works, because the signature is inside the file.

**Send the file.** Quick Share, Google Drive or a message to yourself all work. Open the file on the phone and allow installing unknown apps when Android asks. If Google Play Protect warns about an unknown developer, choose **Install anyway**.

**Or install over USB**, which needs USB debugging turned on once:

1. On the phone, open **Settings > About phone** and tap **Build number** seven times. This turns on **Developer options**.
2. In **Developer options**, turn on **USB debugging**.
3. Plug the phone into the PC and allow debugging when the phone asks.

```powershell
adb install -r apps\mobile\android\app\build\outputs\apk\release\app-release.apk
```

`-r` replaces the installed app and keeps its data. If PowerShell does not know `adb`, it is at `$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe`.

From now on the phone runs release builds only. Develop on the emulator: `pnpm mobile:dev` makes debug builds, signed with the debug key, which cannot install over the release app.

### 6. Check it works

Sign in, choose where songs go, and download a song. The Downloads screen should show the PC online, and the song should reach your library within a minute or two.

Clerk stays on its development instance (`pk_test_` and `sk_test_` keys), and that is fine for one person. A production Clerk instance needs a domain name you own. The `ts.net` address belongs to Tailscale, so it does not count.

## Settings, by place

| Place                                         | Settings                                                                                                                                                                                        |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Server, `deploy/server/.env`                  | `POSTGRES_PASSWORD`, `RABBITMQ_PASSWORD`, `CLERK_SECRET_KEY`, `CLERK_ALLOWED_USER_IDS`, the five `S3_*` values, `WORKER_TOKEN`. Optional: `CLERK_JWT_KEY`, `YOUTUBE_API_KEY`, `CATALOG_COUNTRY` |
| PC, `deploy/worker/.env`                      | `TS_AUTHKEY`, `API_URL`, `RABBITMQ_URL`, `WORKER_TOKEN`. Optional: `WORKER_CONCURRENCY`                                                                                                         |
| PC, `apps/mobile/.env.release`                | `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`. Optional: `EXPO_PUBLIC_CHART_COUNTRY`                                                                                               |
| PC, `%USERPROFILE%\.gradle\gradle.properties` | `AUDIOSTASH_STORE_FILE`, `AUDIOSTASH_STORE_PASSWORD`, `AUDIOSTASH_KEY_ALIAS`, `AUDIOSTASH_KEY_PASSWORD`                                                                                         |

None of these files is committed. The `.env.release` values are built into the APK, so none of them may be a secret. The keystore and its password are secrets: keep them backed up and out of the repository.

## After the first deploy

[Shipping changes](shipping-changes.md) covers getting each change to production.
