# syntax=docker/dockerfile:1

# One image serves both the static web app and the sync server on one port.
# The server runs its TypeScript sources directly (Node 26 strips types), so
# there is no server build step; only the web app is compiled.

FROM node:26.13-slim AS base
WORKDIR /app
# Node 25 and later no longer ship corepack; pin pnpm to the lockfile's version.
RUN npm install --global pnpm@9.15.0

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
COPY apps/server/package.json apps/server/
COPY packages/core/package.json packages/core/
RUN pnpm install --frozen-lockfile

FROM deps AS web
COPY tsconfig.base.json ./
COPY packages/core packages/core
COPY apps/web apps/web
RUN pnpm --filter @chalkline/web build

FROM base AS server-deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
COPY apps/server/package.json apps/server/
COPY packages/core/package.json packages/core/
RUN pnpm install --frozen-lockfile --prod --filter "@chalkline/server..."

FROM node:26.13-slim AS runtime
ENV NODE_ENV=production \
    PORT=4110 \
    HOST=0.0.0.0 \
    DATABASE_PATH=/data/chalkline.db \
    STATIC_DIR=/app/web
WORKDIR /app
COPY --from=server-deps /app/node_modules ./node_modules
COPY --from=server-deps /app/packages/core/node_modules ./packages/core/node_modules
COPY --from=server-deps /app/apps/server/node_modules ./apps/server/node_modules
COPY package.json ./
COPY packages/core/package.json packages/core/
COPY packages/core/src packages/core/src
COPY apps/server/package.json apps/server/
COPY apps/server/src apps/server/src
COPY --from=web /app/apps/web/dist ./web
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME ["/data"]
EXPOSE 4110
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + process.env.PORT + '/healthz').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
# The server never uses Web Storage; turning it off keeps lib0's feature probe
# from printing a warning on every start.
CMD ["node", "--no-experimental-webstorage", "apps/server/src/index.ts"]
