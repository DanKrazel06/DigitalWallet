# =============================================================================
# Dockerfile — wallet-service
# Meme patron que transaction-service (voir ses commentaires detailles).
# A construire depuis la RACINE du monorepo (deps workspace:*).
#   docker build -f services/wallet-service/Dockerfile -t walletdigital/wallet-service:dev .
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1 — BUILD
# -----------------------------------------------------------------------------
FROM node:20-slim AS build

RUN apt-get update && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@10.32.1 --activate

WORKDIR /repo

# Manifestes + lockfile (couche cache des dependances).
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/shared-events/package.json   packages/shared-events/
COPY packages/shared-money/package.json    packages/shared-money/
COPY packages/shared-logger/package.json   packages/shared-logger/
COPY packages/shared-kafka/package.json    packages/shared-kafka/
COPY packages/shared-http/package.json     packages/shared-http/
COPY packages/shared-prisma/package.json   packages/shared-prisma/
COPY services/wallet-service/package.json services/wallet-service/

RUN pnpm install --frozen-lockfile

# Code source.
COPY tsconfig.base.json turbo.json ./
COPY packages/ packages/
COPY services/wallet-service/ services/wallet-service/

# Client Prisma puis compilation du service + packages internes.
RUN pnpm --filter @walletdigital/wallet-service exec prisma generate
RUN pnpm --filter @walletdigital/wallet-service... build
# Recopie le client Prisma genere a cote du code compile (cf. tx-service).
RUN cp -r services/wallet-service/src/generated services/wallet-service/dist/generated

# Arborescence runtime autonome, deps de prod uniquement.
RUN pnpm --filter @walletdigital/wallet-service --prod deploy --legacy /app-deploy

# -----------------------------------------------------------------------------
# Stage 2 — RUNTIME
# -----------------------------------------------------------------------------
FROM node:20-slim AS runtime

RUN apt-get update && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
WORKDIR /app

COPY --from=build /app-deploy/node_modules ./node_modules
COPY --from=build /app-deploy/dist ./dist

USER node
EXPOSE 3003
CMD ["node", "dist/main.js"]

# -----------------------------------------------------------------------------
# Stage 3 — MIGRATE (image dediee aux migrations Prisma)
# -----------------------------------------------------------------------------
FROM build AS migrate
WORKDIR /repo/services/wallet-service
CMD ["pnpm", "exec", "prisma", "migrate", "deploy"]
