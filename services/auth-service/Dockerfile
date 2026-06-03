# syntax=docker/dockerfile:1.7
# ============================================================================
# auth-service — multi-stage build
#
# Stage 1 (builder): full Node toolchain + pnpm + dev deps + TypeScript build.
# Stage 2 (runtime): minimal Node alpine image + production deps only.
#
# Build context expected to be the MONOREPO ROOT (not this directory) so we
# can resolve workspace packages from packages/*.
#
# Usage from the repo root:
#   docker build -f services/auth-service/Dockerfile -t walletdigital/auth-service:dev .
# ============================================================================

# ---------------------------------------------------------------------------
# Stage 1 — builder
# ---------------------------------------------------------------------------
FROM node:22-alpine AS builder

# Build tools required by native modules (argon2 has a native binding).
RUN apk add --no-cache python3 make g++ libc6-compat openssl

# Enable corepack so the exact pnpm version pinned in package.json is used.
RUN corepack enable

WORKDIR /app

# Copy monorepo manifests FIRST so Docker can cache `pnpm install` layers
# when only source files change.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY turbo.json ./

# Copy every workspace's package.json (pnpm needs them all to resolve
# the dependency graph in a monorepo).
COPY apps/client/package.json ./apps/client/
COPY packages/shared-events/package.json ./packages/shared-events/
COPY packages/shared-kafka/package.json ./packages/shared-kafka/
COPY packages/shared-logger/package.json ./packages/shared-logger/
COPY services/auth-service/package.json ./services/auth-service/

# Install all workspace deps (incl. dev) for the build step.
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

# Copy the sources that auth-service depends on. Other workspaces
# (apps/client, other services) are intentionally NOT copied: they would
# invalidate the build cache for unrelated changes.
COPY packages/shared-events ./packages/shared-events
COPY packages/shared-kafka ./packages/shared-kafka
COPY packages/shared-logger ./packages/shared-logger
COPY services/auth-service ./services/auth-service

# Generate the Prisma client (writes to services/auth-service/src/generated/prisma).
RUN pnpm --filter @walletdigital/auth-service exec prisma generate

# Build the shared packages first, then the service itself.
RUN pnpm --filter @walletdigital/events build \
 && pnpm --filter @walletdigital/logger build \
 && pnpm --filter @walletdigital/kafka build \
 && pnpm --filter @walletdigital/auth-service build

# `pnpm deploy` produces a self-contained folder with ONLY runtime deps
# and the compiled output — ready to copy into a slim runtime image.
# `--legacy` is required since pnpm v10 unless workspaces opt into the new
# inject-workspace-packages mechanism (we don't need it for this project).
RUN pnpm --filter @walletdigital/auth-service deploy --legacy --prod /pruned

# ---------------------------------------------------------------------------
# Stage 2 — runtime
# ---------------------------------------------------------------------------
FROM node:22-alpine AS runtime

# OpenSSL is required by Prisma's query engine at runtime. tini is a
# minimal init that forwards SIGTERM properly so our graceful-shutdown
# handlers actually run.
RUN apk add --no-cache openssl tini

WORKDIR /app

# Non-root user — running services as root inside containers is a common
# attack surface. uid/gid 10001 is conventional for application containers.
RUN addgroup -g 10001 -S app \
 && adduser -u 10001 -S app -G app

# Copy the pruned workspace (production deps + compiled output + Prisma client).
# The Prisma client is generated under src/generated/prisma, but the compiled
# JS in dist/infrastructure imports it as ../generated/prisma — so we copy
# the generated folder into BOTH locations (src/ for source-map debugging,
# dist/ for the actual runtime import).
COPY --from=builder --chown=app:app /pruned/node_modules ./node_modules
COPY --from=builder --chown=app:app /pruned/dist ./dist
COPY --from=builder --chown=app:app /pruned/src/generated ./src/generated
COPY --from=builder --chown=app:app /pruned/src/generated ./dist/generated
COPY --from=builder --chown=app:app /pruned/prisma ./prisma
COPY --from=builder --chown=app:app /pruned/package.json ./package.json

USER app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3001

EXPOSE 3001

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/main.js"]
