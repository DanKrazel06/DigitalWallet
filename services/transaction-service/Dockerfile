# =============================================================================
# Dockerfile — transaction-service
#
# IMPORTANT : ce Dockerfile DOIT etre construit depuis la RACINE du monorepo,
# pas depuis ce dossier, car le service depend des packages `packages/shared-*`
# via `workspace:*`. Le contexte de build doit donc contenir tout le monorepo.
#
#   docker build -f services/transaction-service/Dockerfile \
#                -t walletdigital/transaction-service:dev .
#
# Construction multi-stage :
#   - stage "build"   : installe TOUTES les deps, genere le client Prisma,
#                       compile le service + ses packages partages (TypeScript -> dist/).
#   - stage "runtime" : image finale, minimale, ne contient que ce qu'il faut
#                       pour executer `node dist/main.js`.
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1 — BUILD
# -----------------------------------------------------------------------------
FROM node:20-slim AS build

# OpenSSL est requis par les moteurs Prisma (sinon `prisma generate` echoue
# sur l'image slim qui ne l'embarque pas par defaut).
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

# pnpm est fourni via corepack (livre avec Node 20). On epingle la version
# declaree dans le package.json racine (packageManager) pour la reproductibilite.
RUN corepack enable && corepack prepare pnpm@10.32.1 --activate

WORKDIR /repo

# --- Couche 1 : manifestes + lockfile uniquement -----------------------------
# On copie d'abord SEULEMENT les fichiers qui decrivent les dependances.
# Tant qu'ils ne changent pas, Docker reutilise le cache de `pnpm install` :
# modifier du code source ne re-telecharge pas les dependances.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/shared-events/package.json   packages/shared-events/
COPY packages/shared-money/package.json    packages/shared-money/
COPY packages/shared-logger/package.json   packages/shared-logger/
COPY packages/shared-kafka/package.json    packages/shared-kafka/
COPY packages/shared-http/package.json     packages/shared-http/
COPY packages/shared-prisma/package.json   packages/shared-prisma/
COPY services/transaction-service/package.json services/transaction-service/

# Installe toutes les deps du workspace (frozen = strictement le lockfile).
RUN pnpm install --frozen-lockfile

# --- Couche 2 : le code source -----------------------------------------------
# Maintenant seulement on copie le reste (le code change souvent).
COPY tsconfig.base.json turbo.json ./
COPY packages/ packages/
COPY services/transaction-service/ services/transaction-service/

# Genere le client Prisma (ecrit dans services/.../src/generated/prisma).
# Doit se faire AVANT le `tsc` du service qui importe ce client genere.
RUN pnpm --filter @walletdigital/transaction-service exec prisma generate

# Compile le service ET toutes ses dependances internes (packages/shared-*).
# La syntaxe `...` de pnpm signifie "ce package + tout ce dont il depend".
# Turborepo (via le script build) ordonne correctement les compilations.
RUN pnpm --filter @walletdigital/transaction-service... build

# Le client Prisma est genere dans src/generated/prisma, mais le code COMPILE
# (dist/infrastructure/prisma-client.js) l'importe via '../generated/prisma',
# donc il s'attend a le trouver dans dist/generated/prisma. `tsc` ne copie pas
# ces fichiers .js generes (ce ne sont pas des sources TS). On les recopie donc
# manuellement a cote du code compile.
RUN cp -r services/transaction-service/src/generated services/transaction-service/dist/generated

# Elague les dependances de dev : ne garde que les deps de production dans
# node_modules. Reduit fortement la taille de l'image finale.
# `pnpm deploy` cree une arborescence autonome pour UN package (pas de `...` :
# il resout lui-meme les packages internes dont le service depend).
# --legacy : requis pour `deploy` dans un workspace utilisant le lockfile racine.
RUN pnpm --filter @walletdigital/transaction-service --prod deploy --legacy /app-deploy

# -----------------------------------------------------------------------------
# Stage 2 — RUNTIME
# -----------------------------------------------------------------------------
FROM node:20-slim AS runtime

# OpenSSL : le client Prisma en a aussi besoin a l'execution.
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
WORKDIR /app

# `pnpm deploy` a produit dans /app-deploy une arborescence autonome :
# node_modules de prod + le dist/ compile (qui contient deja dist/generated/prisma
# grace au cp ci-dessus). On copie node_modules et dist ; le client Prisma vit
# desormais sous dist/generated, au bon endroit relatif pour les imports compiles.
COPY --from=build /app-deploy/node_modules ./node_modules
COPY --from=build /app-deploy/dist ./dist

# Securite : ne pas tourner en root. L'image node fournit deja l'utilisateur `node`.
USER node

# Documentaire : le service ecoute sur 3004 (cf. config.ts / PORT).
EXPOSE 3004

# Point d'entree. `node dist/main.js` lit sa config depuis les variables
# d'environnement (injectees par Kubernetes via ConfigMap/Secret).
CMD ["node", "dist/main.js"]

# -----------------------------------------------------------------------------
# Stage 3 — MIGRATE (image dediee aux migrations Prisma)
#
# Pourquoi une image separee plutot que d'alourdir le runtime ?
#   - Le runtime n'a PAS besoin du CLI prisma ni des migrations : il reste
#     minimal et sans surface inutile.
#   - Cette image-ci derive du stage `build`, qui contient deja TOUT (CLI
#     prisma, schema, dossier migrations, toutes les deps avec leurs symlinks
#     pnpm intacts). Aucune copie fragile de morceaux de node_modules.
#
# Un Job Kubernetes lancera cette image avec `prisma migrate deploy` avant de
# demarrer le service. Construire ce stage :
#   docker build -f services/transaction-service/Dockerfile \
#                --target migrate -t walletdigital/transaction-service-migrate:dev .
# -----------------------------------------------------------------------------
FROM build AS migrate
WORKDIR /repo/services/transaction-service
# `migrate deploy` applique les migrations deja existantes (jamais d'edition
# de schema en cluster, contrairement a `migrate dev`). DATABASE_URL est
# injecte par le Job via une variable d'environnement.
CMD ["pnpm", "exec", "prisma", "migrate", "deploy"]
