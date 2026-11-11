# syntax=docker/dockerfile:1
# Build from the repository root, so the workspace packages are in the build context:
#   docker build -f apps/api/Dockerfile -t pluck-api .

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
RUN pnpm install --offline --frozen-lockfile --prod --filter '@pluck/api...'

# Node runs the TypeScript directly, so there is no compile step. Copying /app
# leaves pnpm's download store behind in the build stage.
FROM node
ENV NODE_ENV=production
COPY --from=build /app /app
USER node
EXPOSE 3000
CMD ["node", "apps/api/src/index.ts"]
