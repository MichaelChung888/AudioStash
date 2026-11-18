# The tools AudioStash uses, and why

This note lists every tool, service and library AudioStash depends on. For each one it says what the tool is, what it does in AudioStash, why it was chosen, and what else could have done the job. The other options are there so you know the landscape, not only this project's corner of it.

The tools are grouped by where they run, from the cloud server down to your laptop. [Deploying AudioStash](../deploy.md) shows how they are set up, and [docs/adr](../adr) records the bigger decisions in more detail.

## Contents

| Group                                                             | Tools                                                                               |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| [Hosting and networking](#hosting-and-networking)                 | The cloud server, Ubuntu, SSH, Docker and Docker Compose, Tailscale                 |
| [Storing data](#storing-data)                                     | PostgreSQL, Drizzle, RabbitMQ, Cloudflare R2, RustFS                                |
| [The API](#the-api)                                               | Node.js, TypeScript, Hono, Zod, pino                                                |
| [Sign-in](#sign-in)                                               | Clerk                                                                               |
| [The worker](#the-worker)                                         | yt-dlp, Deno, ffmpeg, Python and mutagen, sharp                                     |
| [Song data from outside](#song-data-from-outside)                 | Deezer, Apple's charts, LRCLIB, the YouTube Data API                                |
| [The phone app](#the-phone-app)                                   | React Native, Expo, Expo Router, expo-sqlite, TanStack Query, expo-audio, EAS Build |
| [Building and checking the code](#building-and-checking-the-code) | pnpm, Turborepo, Biome, Vitest, Testcontainers, GitHub Actions                      |

## Hosting and networking

### The cloud server

**What it is.** A computer in a data centre that you rent and reach over the internet. Most are **virtual machines (VMs)**: one large physical machine is split into several smaller ones, each with its own share of processor, memory and disk, and each behaving like a separate computer.

**In AudioStash.** It runs the API, PostgreSQL and RabbitMQ, so the phone can sync and queue downloads even when your PC is off.

**Why this one.** [Oracle Cloud's Always Free tier](../deploy.md#choose-a-server) gives a VM with 2 processor cores and 12 GB of memory at no cost. The catch: Oracle may reclaim a free VM that sits idle, and free capacity in a region often runs out. Hetzner is the paid fallback, at about €4–5 a month for a similar machine with none of those catches.

**Other options.**

- **DigitalOcean, Linode (Akamai), Vultr.** Simple VMs, similar to Hetzner but usually dearer for the same size.
- **AWS EC2, Google Compute Engine, Azure.** The big clouds. Very capable, but billing is complex, and their free tiers are small or end after 12 months.
- **A platform as a service (PaaS) such as Fly.io, Railway or Render.** You give them a container and they run it, with no server to manage. Easier day to day, but RabbitMQ and PostgreSQL usually become separate paid add-ons.
- **Your home PC.** Free, but the phone could not reach the library while the PC is asleep. [ADR 0001](../adr/0001-downloads-run-on-a-home-pc.md) explains why only the worker runs there.

### Ubuntu

**What it is.** An **operating system**: the base software that runs a computer, like Windows on your PC. Ubuntu is one **distribution** of **Linux**. Linux itself is only the core (the kernel); a distribution bundles it with an installer, a package manager (`apt`) and a set of standard programs. Ubuntu is made by a company called Canonical.

**In AudioStash.** It is the operating system on the cloud server. You type its commands (`sudo`, `apt`, `nano`) when you connect with SSH.

**Why this one.** Almost every server guide, Docker's included, has Ubuntu instructions first. The version used, 24.04, is an **LTS (long-term support)** release, which gets security updates until 2029. Oracle and Hetzner both offer it with one click.

**Other options.**

- **Debian.** The distribution Ubuntu is built from. Changes even more slowly, and is just as good for a server. The AudioStash Docker images are in fact based on Debian (the `trixie` in `node:24.22.2-trixie-slim`).
- **Fedora, Rocky Linux, AlmaLinux.** The Red Hat family. They use `dnf` instead of `apt`. Common in companies.
- **Alpine.** Very small. Popular inside containers, less so as the main system on a server.
- **Windows Server.** Costs a licence, and most server software is written for Linux first.

Servers usually run Linux because it is free, uses little memory, and is fully controlled from a text terminal, with no screen needed.

### SSH

**What it is.** Secure Shell: a way to open a terminal on another computer over the network. Everything sent is encrypted. You prove who you are with a **key pair**: a private key that stays on your PC, and a public key that you give to the server. Only someone holding the private key can sign in.

**In AudioStash.** You use it to set up and update the server. [Deploying AudioStash](../deploy.md) explains what "on the server" means.

**Other options.** A web console in the cloud provider's dashboard works in an emergency but is clumsy. Graphical remote desktop (RDP, VNC) is for machines with a screen, which servers rarely have. For servers, SSH is the standard.

### Docker and Docker Compose

**What it is.** Docker packages a program with everything it needs (the right Node version, system libraries, ffmpeg) into an **image**. A running copy of an image is a **container**. A container shares the host's Linux kernel but has its own files, processes and network, so it cannot clash with other programs on the machine. **Docker Compose** starts several containers together from one file, `compose.yaml`, with their settings, storage and start order.

**In AudioStash.** Every part except the phone app runs in a container: PostgreSQL, RabbitMQ and the API on the server ([deploy/server/compose.yaml](../../deploy/server/compose.yaml)), the worker on your PC ([deploy/worker/compose.yaml](../../deploy/worker/compose.yaml)), and everything together for local development ([compose.yaml](../../compose.yaml)).

**Why this one.** The same image runs on your PC, in GitHub Actions and on the server, so "it worked on my machine" problems mostly disappear. The worker needs yt-dlp, ffmpeg and Python at exact versions; on Windows those are much easier to get inside a Linux container than installed by hand. Updating the server is one command that rebuilds and restarts what changed.

**Other options.**

- **Install everything directly on the server**, and keep the programs running with **systemd** (Linux's service manager). Uses a little less memory, but every tool and version is installed by hand, and the server slowly drifts from your PC.
- **Podman.** Runs the same images without a background service, and can run containers without administrator rights. Mostly a drop-in replacement for Docker.
- **Kubernetes.** Runs containers across many machines, restarts them, and spreads load. Built for teams and fleets of servers; far too much for one VM.

### Tailscale

**What it is.** A **VPN (virtual private network)**: a private network laid over the public internet. Each machine you add (the server, your PC, a laptop, even your phone) gets a private address starting with `100.`, and these machines can reach each other at those addresses from anywhere. Nothing outside your network can. Your private network is called a **tailnet**.

Under the hood Tailscale uses **WireGuard**, an encrypted tunnel built into Linux. Tailscale adds what WireGuard leaves to you: handing out keys, finding a route between machines behind home routers, and a dashboard to manage it all.

**The network is between machines, not between programs.** The tailnet joins the server to your PC. It does not know about RabbitMQ or the API. Two Tailscale features then decide which programs on the server can be reached, and from where:

| Feature            | Who can reach it   | What AudioStash points at it                                                                               |
| ------------------ | ------------------ | ---------------------------------------------------------------------------------------------------------- |
| `tailscale serve`  | Only your tailnet  | Port 3000 (the API) and port 5672 (RabbitMQ), for the worker on your PC                                    |
| `tailscale funnel` | The whole internet | Port 3000 (the API) at `https://audiostash.<tailnet>.ts.net`, for the phone, with a real HTTPS certificate |

Both forward to `localhost` on the server, which is where Docker publishes the containers' ports (see the comment at the top of [deploy/server/compose.yaml](../../deploy/server/compose.yaml)).

**What this gives AudioStash.**

1. **RabbitMQ is never on the internet.** Its port answers only on the tailnet. A RabbitMQ port open to the internet would be scanned within hours and attacked with password guesses.
2. **No firewall work.** Oracle and Hetzner block incoming traffic by default, and so does your home router. Tailscale connects outwards from each machine, so nothing needs opening.
3. **HTTPS for the phone with no domain name.** Funnel gives you a `ts.net` address with a valid certificate. Without it you would buy a domain, point it at the server, and run a program that renews certificates.
4. **SSH without the key file**, with `tailscale up --ssh`.

**Other options.**

- **Open the ports to the internet.** Give RabbitMQ a long password and TLS encryption, and allow only your home's IP address through the firewall. It works, but most home IP addresses change from time to time, and one mistake leaves RabbitMQ exposed.
- **Plain WireGuard.** The same tunnel without the extras. Free and fast, but you write the configuration files and swap keys yourself, and one end needs a reachable public address.
- **Cloudflare Tunnel.** Very good for putting a website online (the Funnel part), and free. Reaching a raw port such as RabbitMQ's means running Cloudflare's program on both machines, and it needs a domain on Cloudflare.
- **ZeroTier, NetBird, Headscale.** Close relatives of Tailscale. Headscale is a self-hosted version of Tailscale's coordination server.
- **An SSH tunnel** from the PC to the server. Works with nothing extra installed, but drops when the connection blips and needs a helper (such as `autossh`) to reconnect.

## Storing data

### PostgreSQL

**What it is.** A **relational database**: data lives in tables of rows and columns, and you ask for it in **SQL**. It runs **transactions**, groups of changes that either all happen or none do. It is free, open source and over 25 years old.

**In AudioStash.** It holds the library on the server: songs, playlists, downloads, the change log phones sync from ([ADR 0004](../adr/0004-sync-through-a-change-log.md)), and the outbox of jobs waiting to go to RabbitMQ ([ADR 0002](../adr/0002-jobs-through-an-outbox.md)).

**Why this one.** The outbox and the change log both depend on transactions and row locks working exactly as documented, and PostgreSQL is the most trusted open-source database for that. It also has a free Docker image, and nearly every hosting service supports it.

**Other options.**

- **MySQL or MariaDB.** Also relational and widely used. Fine here too; PostgreSQL has a richer feature set and is the usual choice for new TypeScript projects.
- **SQLite on the server.** A database in a single file, with no server process. Excellent for one program on one machine, but the API and the migration step would share the file, and backups need care while it is in use.
- **MongoDB.** A **document database**: it stores JSON-like records with no fixed columns. Flexible, but the library is naturally tables that refer to each other (playlists hold songs), which is what relational databases are for.
- **A hosted PostgreSQL** such as Neon or Supabase. No database to run, and free tiers exist. One more account, and the data lives outside your server.

### Drizzle and postgres.js

**What they are.** **postgres.js** (the `postgres` package) is the **driver**: the code that opens a connection to PostgreSQL and sends it SQL. **Drizzle** sits on top. You describe the tables once in TypeScript ([packages/db/src/schema.ts](../../packages/db/src/schema.ts)), and Drizzle gives typed queries that read like SQL. **drizzle-kit** compares that description with the last migration and writes the next one.

**Why these.** Drizzle stays close to SQL, so what you write is what runs. It needs no code-generation step and no decorators, which matters because Node runs the `.ts` files directly (see [Node.js and TypeScript](#nodejs-and-typescript)).

**Other options.**

- **Prisma.** The most popular TypeScript database library. It uses its own schema language and a generate step that writes code into `node_modules`.
- **TypeORM, MikroORM.** Describe tables with classes and decorators, which Node's type stripping cannot run.
- **Kysely.** A typed query builder like Drizzle's queries, without the schema or migrations.
- **Plain SQL** through postgres.js alone. Fully flexible, but the results have no types, and a renamed column is found only when a query fails.

### RabbitMQ

**What it is.** A **message broker**: a program that holds **queues** of messages. One program **publishes** a message, and another **consumes** it when it is ready. RabbitMQ keeps a message until the consumer confirms it is done, and hands it to someone else if the consumer disappears first.

**In AudioStash.** The API puts "download this song" and "resolve this request" jobs on queues. The worker on your PC takes them one at a time. If a job fails, it goes to a retry queue and comes back after 30 seconds, then 2 minutes, then 10 minutes. A job that fails every time ends up in a **dead-letter queue** to look at by hand. The code is in [packages/messaging](../../packages/messaging/src/topology.ts), using the `rabbitmq-client` library.

**Why this one.** It gives retries, delays, dead letters and redelivery out of the box, and it works across machines, which matters because the worker is on a different computer from the API. [ADR 0002](../adr/0002-jobs-through-an-outbox.md) compares it with letting the worker ask the API for work.

**Other options.**

- **A queue table in PostgreSQL**, read with `SELECT … FOR UPDATE SKIP LOCKED` (libraries: pg-boss, Graphile Worker). One fewer service to run. The worker would then need to reach the database, or the API would have to pass jobs on.
- **Redis with BullMQ.** Very popular in Node projects. Redis keeps data in memory, so it must be set up carefully to not lose jobs on a restart.
- **Kafka.** A **log** rather than a queue: it keeps every message for days so many readers can replay them. Built for high volume; heavy for one worker.
- **Amazon SQS, Google Pub/Sub.** Hosted queues with nothing to run, tied to one cloud provider.
- **NATS.** Light and fast, with a persistence layer (JetStream). Less common, so fewer guides.

### Cloudflare R2

**What it is.** **Object storage**: a service that stores files (called objects) in **buckets** and serves them over HTTPS. R2 speaks the same API as Amazon S3, the service that defined this kind of storage, so S3 tools work with it.

**In AudioStash.** It holds the song files and covers. Neither the worker nor the phone holds an R2 key. The API hands out **presigned URLs**: links that allow one upload or one download of one file, and stop working after a few minutes ([apps/api/src/services/storage.ts](../../apps/api/src/services/storage.ts)). The API makes them with the AWS SDK (`@aws-sdk/client-s3`), which works with any S3-compatible store.

**Why this one.** R2 does not charge for **egress** (data sent out), and every song you play or mirror to your phone is egress. Its free tier covers 10 GB of storage.

**Other options.**

- **Amazon S3.** The original. Charges for every gigabyte downloaded once past a small free allowance.
- **Backblaze B2.** Cheap storage, with free egress up to a limit. A good alternative.
- **Files on the server's disk.** No extra service, but they then need their own backups, and the disk fills up.
- **Google Drive or Dropbox.** Built for people, not programs; their APIs and limits make them awkward as app storage.

### RustFS

**What it is.** A small S3-compatible storage server you run yourself.

**In AudioStash.** Only in local development ([compose.yaml](../../compose.yaml)), standing in for R2 so you can work offline and with no Cloudflare account.

**Other options.** **MinIO** was the usual choice, but it stopped publishing ready-made free images in 2025. **LocalStack** imitates many AWS services at once, and is more than this needs.

## The API

### Node.js and TypeScript

**What they are.** **Node.js** runs JavaScript outside a browser, on servers and laptops. **TypeScript** is JavaScript with **types**: notes that say what kind of value each variable holds, checked before the code runs, so many mistakes are caught without running anything.

**In AudioStash.** The API, the worker and the shared packages are TypeScript run by Node 24. Node 24 can remove the types itself as it loads each file (**type stripping**), so there is no build step. The cost is a few rules about which TypeScript syntax to avoid, listed in [CLAUDE.md](../../CLAUDE.md#typescript-without-a-build).

**Why these.** One language across the phone, the API and the worker, with shared types for everything they send each other ([packages/contracts](../../packages/contracts)).

**Other options.**

- **Bun, Deno.** Newer JavaScript runtimes that run TypeScript directly and start faster. Bun is mostly compatible with Node; not every library works perfectly on either.
- **Go, Python, C#, Java, Kotlin.** All fine for an API. A second language would mean no shared types with the phone app.

### Hono

**What it is.** A small **web framework**: it matches each incoming request's address to the function that handles it, and runs **middleware** (code that runs before every handler, such as the sign-in check). It is built on the web's standard `Request` and `Response` objects, so the same code runs on Node, Bun, Deno and Cloudflare Workers.

**In AudioStash.** All of [apps/api](../../apps/api/src), including the live event stream the phone listens to.

**Why this one.** Small, fast, typed throughout, and validates requests with Zod through `@hono/zod-validator`.

**Other options.**

- **Express.** The oldest and most used Node framework. Huge ecosystem, but built before TypeScript and modern JavaScript, so its types and error handling are weaker.
- **Fastify.** Fast, with a strong plugin system and validation built in. A good alternative.
- **NestJS.** A large framework with dependency injection, organised around classes and decorators. Its style relies on syntax Node's type stripping cannot run.

### Zod

**What it is.** A library that checks, while the program runs, that data has the shape you expect, and gives you a TypeScript type for that shape. TypeScript's own checks vanish when the code runs, so data arriving from outside (a request body, an external API, an environment variable) needs a check like this.

**In AudioStash.** It checks every request body, every reply from Deezer, Apple, LRCLIB and YouTube, and the settings in each app's `env.ts`. The shared shapes are in [packages/contracts](../../packages/contracts).

**Other options.** **Valibot** (smaller, split into separate functions), **ArkType** (faster, with its own syntax), **Yup** (older, from the form-validation world). Zod is the most widely supported.

### pino

**What it is.** A **logging** library. It writes one JSON object per line, with a level (`info`, `warn`, `error`) and named fields, which is easy for programs to search. `pino-pretty` turns those lines into readable coloured text during development.

**Other options.** **Winston** (older, very configurable, slower), or `console.log` (no levels and no structure, so logs are hard to search).

## Sign-in

### Clerk

**What it is.** A hosted sign-in service. It stores accounts and passwords, runs Google, Apple, GitHub and Facebook sign-in, emails one-time codes, and gives the phone short-lived tokens to send to the API.

**In AudioStash.** The phone signs in with Clerk. The API checks each token and lets in only user ids on its allow-list. [Authentication with Clerk](auth.md) explains the whole flow, and [ADR 0003](../adr/0003-clerk-for-one-owner.md) the decision.

**Other options.**

- **Auth0.** The long-standing leader. Powerful, with a smaller free tier and more set-up.
- **Firebase Authentication, Supabase Auth.** Cheap or free, and best when you use the rest of Firebase or Supabase.
- **Better Auth, Lucia-style libraries, or your own code.** Sign-in inside your own API. No outside service, but then you store passwords and send sign-in emails yourself.

## The worker

### yt-dlp

**What it is.** A command-line program that downloads audio and video from YouTube and many other sites. It is an active fork of the older `youtube-dl`. YouTube changes often to stop downloaders, and yt-dlp releases fixes within days.

**In AudioStash.** The worker runs it to fetch each song's audio. Its version is pinned in [apps/worker/requirements.txt](../../apps/worker/requirements.txt); when downloads start failing, updating it is the first fix.

**Other options.** Node libraries such as `ytdl-core` and its forks break more often and fall behind YouTube's changes. Few alternatives are as well maintained.

### Deno

**What it is.** A JavaScript runtime, like Node.

**In AudioStash.** Only yt-dlp uses it. YouTube's player hides the real download addresses behind JavaScript, and yt-dlp runs that JavaScript in Deno to recover them. It is installed through yt-dlp's `deno` extra; AudioStash's own code does not run on Deno.

### ffmpeg

**What it is.** The standard command-line tool for converting and inspecting audio and video. Most media software uses it underneath.

**In AudioStash.** It converts downloaded audio and measures each file's length.

**Other options.** There is no real competitor for this breadth of formats. Node libraries that "do audio" usually call ffmpeg themselves.

### Python and mutagen

**What they are.** **Python** is a programming language. **mutagen** is a Python library that reads and writes the **tags** inside audio files: title, artist, album, lyrics and cover art, which other music players show.

**In AudioStash.** [apps/worker/scripts/tag.py](../../apps/worker/scripts/tag.py) writes the tags. Python is already in the worker's image because yt-dlp is written in Python.

**Why this one.** mutagen writes tags for every common audio format. The Node libraries either only read tags (`music-metadata`) or only write one format (`node-id3`, for MP3).

### sharp

**What it is.** A Node library that resizes and converts images quickly, using the C library libvips underneath.

**In AudioStash.** The worker shrinks cover art before uploading it. The mobile app uses it in a script that draws the app icons.

**Other options.** **Jimp** is pure JavaScript, so it installs anywhere but is much slower. **ImageMagick** is a command-line tool, like ffmpeg for images.

## Song data from outside

These are free web APIs the [packages/catalog](../../packages/catalog/src) clients call.

| Service              | What AudioStash takes from it                                 | Notes                                                                                                                          |
| -------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **Deezer**           | Song search, album details, and the genre charts              | Public endpoints need no key.                                                                                                  |
| **Apple's charts**   | The most-played chart                                         | A public feed; no key.                                                                                                         |
| **LRCLIB**           | Lyrics, including **synced lyrics** with a time for each line | Free and open, run by volunteers.                                                                                              |
| **YouTube Data API** | YouTube search inside the app                                 | Needs a free Google API key. The free allowance is 10,000 units a day, and each search costs 100, so about 100 searches a day. |

**Other options.** **Spotify's Web API** has excellent data but now requires an approved app for most uses. **MusicBrainz** is a free, open music encyclopedia with very accurate data, but strict rate limits and no charts. **Last.fm** has listening charts and tags. **Genius** has lyrics, but not synced ones, and its terms forbid storing them.

## The phone app

### React Native and Expo

**What they are.** **React** is a library for building screens out of **components**, small pieces that redraw when their data changes. **React Native** uses React to draw real Android and iOS screens instead of web pages. **Expo** is a toolkit around React Native: ready-made **native modules** (code that reaches the phone's own features, such as the file system or audio), a build service, and tools that hide most of the Android project.

**In AudioStash.** The whole app in [apps/mobile](../../apps/mobile). [Expo, and how the app becomes an APK](expo-and-the-apk.md) covers it in depth.

**Why these.** You write TypeScript, as in the rest of the project, and share types with the API. Expo's modules cover everything AudioStash needs.

**Other options.**

- **Native Android with Kotlin and Jetpack Compose.** The best performance and full access to Android, but a second language and no shared code.
- **Flutter.** Google's cross-platform toolkit, in the Dart language. Very smooth screens; Dart is a language you would use only for this.
- **React Native without Expo.** More control, but you look after the Android project and every native library yourself.
- **A web app (PWA).** No install, but a browser cannot write to a music folder or reliably play in the background.

### Expo Router

**What it is.** Navigation based on files: each file under [apps/mobile/src/app](../../apps/mobile/src/app) is a screen, and its path is the screen's address.

**Other options.** **React Navigation**, which Expo Router is built on, where screens are listed in code instead.

### expo-sqlite

**What it is.** SQLite on the phone: a full SQL database kept in one file in the app's storage.

**In AudioStash.** The phone keeps its own copy of the library in it, so every screen works offline. Edits are saved locally and queued in an outbox to send later. [ADR 0005](../adr/0005-local-database-on-the-phone.md) and [The offline library and sync](offline-sync.md) explain how.

**Other options.** **AsyncStorage** stores only keys and text, with no queries. **WatermelonDB** and **PowerSync** are full sync systems (the ADR says why they lost). **op-sqlite** is a faster SQLite module outside Expo. **Realm** was popular, but MongoDB has stopped developing its sync service.

### TanStack Query

**What it is.** Also called React Query. It runs a data request for a screen, **caches** the result (keeps a copy so the next screen that wants it gets it at once), and runs it again when told the data changed.

**In AudioStash.** Screens read the local SQLite library through it. Whenever the local library changes, from a sync or your own edit, it runs those queries again.

**Other options.** **SWR** (similar and smaller), **Redux Toolkit Query** (part of Redux), or a hand-written `useEffect` in each screen.

### expo-audio

**What it is.** Expo's audio player module, with playlists, background playback and lock-screen controls.

**In AudioStash.** One player for the whole app, kept outside React, in [apps/mobile/src/player/player.ts](../../apps/mobile/src/player/player.ts). [ADR 0007](../adr/0007-one-player-outside-react.md) explains why, and compares it with `react-native-track-player`.

### EAS Build

**What it is.** Expo Application Services: Expo's servers build the Android **APK** (the install file) from your code, so you need no Android tools on your PC.

**In AudioStash.** The `preview` profile in [apps/mobile/eas.json](../../apps/mobile/eas.json) makes an APK you install on your phone. The free plan gives 30 builds a month.

**Other options.** Build on your own PC with the Android SDK (`expo run:android` or Gradle), or in GitHub Actions on a runner that has the SDK installed. Both are free and need more set-up.

## Building and checking the code

### pnpm

**What it is.** A **package manager**: it downloads the libraries a project depends on into `node_modules`, at the versions written in the **lockfile** (`pnpm-lock.yaml`). Its **workspaces** feature lets one repository hold several packages that use each other, as AudioStash's `apps/*` and `packages/*` do.

**Why this one.** It keeps one copy of each library version on disk and links to it, so installs are fast and small. It is also strict: a package can import only libraries it lists, which catches missing dependencies early.

**Other options.** **npm** (comes with Node; slower, less strict), **Yarn** (popular before pnpm, with its own workspace support), **Bun's** package manager (very fast).

### Turborepo

**What it is.** Runs a script (`typecheck`, `test`) in every package of a monorepo, in the right order and in parallel, and skips packages whose files have not changed since the last run.

**Other options.** **Nx** (more features, more set-up), or plain `pnpm -r run`, which runs the script everywhere but caches nothing.

### Biome

**What it is.** A **linter** (finds likely mistakes and bad patterns) and a **formatter** (lays out the code the same way every time), in one fast program.

**Other options.** **ESLint** with **Prettier**: the usual pair, with far more plugins, but two tools and two configurations, and much slower. **oxlint** is a newer fast linter.

### Vitest

**What it is.** A test runner: it finds the `*.test.ts` files, runs them and reports what failed.

**Other options.** **Jest** (long the standard; needs extra set-up for TypeScript and modern modules), or Node's own `node:test` (built in, fewer conveniences).

### Testcontainers

**What it is.** A library that starts real Docker containers from inside a test, then removes them when the test ends.

**In AudioStash.** `pnpm test:integration` runs the API's database code against a real PostgreSQL, and the messaging code against a real RabbitMQ.

**Why this one.** A fake database cannot show whether a transaction or a lock really behaves as the code assumes; a real one can.

**Other options.** A shared database started by hand before the tests, which tests can leave in a mess for each other, or **mocks** (fake objects), which test only what you told them to do.

### GitHub Actions

**What it is.** GitHub's service for running jobs on its own machines when code is pushed. Running every check on each push is called **continuous integration (CI)**.

**In AudioStash.** [.github/workflows/ci.yml](../../.github/workflows/ci.yml) runs lint, typecheck, unit tests and integration tests, and builds both Docker images, on every push to `main` and every pull request.

**Other options.** **GitLab CI**, **CircleCI**, **Buildkite**. GitHub Actions is the natural choice when the code is on GitHub, and free for public repositories.
