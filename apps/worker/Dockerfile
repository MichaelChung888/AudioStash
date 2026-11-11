# syntax=docker/dockerfile:1
# Build from the repository root, so the workspace packages are in the build context:
#   docker build -f apps/worker/Dockerfile -t pluck-worker .

FROM node:24.22.2-trixie-slim AS node
# Corepack installs the pnpm version named in package.json's packageManager field.
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /app

FROM node AS build
# pnpm fetch needs only the lockfile, so this layer is rebuilt only when dependencies change.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm fetch --prod
COPY . .
RUN pnpm install --offline --frozen-lockfile --prod --filter '@pluck/worker...'

# The tools are installed before the code is copied, so a code change does not
# reinstall them. ffmpeg converts and measures the audio. Python runs yt-dlp and
# the tagging script, from a virtual environment because Debian does not allow
# pip to install into the system Python.
FROM node AS tools
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg python3 python3-venv \
  && rm -rf /var/lib/apt/lists/*
COPY apps/worker/requirements.txt /tmp/requirements.txt
RUN python3 -m venv /opt/python \
  && /opt/python/bin/pip install --no-cache-dir -r /tmp/requirements.txt
ENV PATH=/opt/python/bin:$PATH

FROM tools
ENV NODE_ENV=production
COPY --from=build /app /app
USER node
CMD ["node", "apps/worker/src/index.ts"]
