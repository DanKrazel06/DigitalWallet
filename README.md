# WalletDigital

Wallet digital fiat full-stack — projet d'apprentissage avec une qualité d'ingénierie de niveau production.

## Stack

- **Frontend** : React + Vite + TypeScript
- **Backend** : Architecture microservices Node.js + Express + TypeScript
- **Données** : PostgreSQL (transactionnel), MongoDB (notifications), Redis (cache/sessions)
- **Messaging** : Kafka via Redpanda (events, event sourcing)
- **Infra** : Docker Compose (dev), Kubernetes (kind) (staging-like)
- **Qualité** : ESLint, Prettier, commitlint, Husky, Vitest, Playwright, Prometheus, Grafana
- **Monorepo** : pnpm workspaces + Turborepo

## Structure

```
WalletDigital/
├── apps/
│   ├── client/                # Frontend React
│   └── api-gateway/           # (à venir) Point d'entrée HTTP
├── services/                  # (à venir) Microservices métier
│   ├── auth-service/
│   ├── account-service/
│   ├── wallet-service/
│   ├── transaction-service/
│   └── notification-service/
├── packages/
│   └── shared-logger/         # Logger Pino partagé
├── infra/                     # Docker Compose + manifests k8s
├── docs/                      # ADRs, architecture, OpenAPI
└── .github/workflows/         # CI/CD
```

## Prérequis

- Node.js >= 20
- pnpm >= 10 (`npm install -g pnpm`)
- Docker Desktop (pour les phases suivantes)

## Installation

```bash
pnpm install
```

## Infrastructure locale

La stack tourne dans Docker Compose. Avant la première utilisation, copier `.env.example` en `.env` à la racine et adapter les mots de passe.

```bash
pnpm infra:up      # Démarre PG + Mongo + Redis + RabbitMQ + Mailhog
pnpm infra:ps      # Vérifie l'état des conteneurs (tous "healthy")
pnpm infra:logs    # Suit les logs en streaming (Ctrl+C pour quitter)
pnpm infra:down    # Arrête tout (données préservées)
pnpm infra:reset   # Arrête ET efface tous les volumes (repart de zéro)
```

| Service | Port | UI |
|---|---|---|
| PostgreSQL | 5433 | — |
| MongoDB | 27017 | — |
| Redis | 6379 | — |
| Kafka (Redpanda) | 9092 | http://localhost:8080 (Redpanda Console) |
| Mailhog SMTP | 1025 | http://localhost:8025 |

## Développement

```bash
pnpm dev          # Lance tous les workspaces en mode dev (via Turborepo)
pnpm build        # Build tous les workspaces
pnpm lint         # Lint tous les workspaces
pnpm typecheck    # Vérifie les types TS
pnpm test         # Lance tous les tests
pnpm format       # Reformate tout le code
```

## Conventions

- **Commits** : [Conventional Commits](https://www.conventionalcommits.org/) imposés via Husky + commitlint
  - `feat: ...`, `fix: ...`, `docs: ...`, `refactor: ...`, etc.
- **Formatage** : Prettier automatique au commit (via lint-staged)
- **Lint** : ESLint exécuté au commit sur les fichiers modifiés

## Roadmap

Voir le plan détaillé dans `docs/` pour les phases d'implémentation à venir.

- [x] Phase 1 — Restructuration du monorepo
- [ ] Phase 2 — Infra locale (Docker Compose)
- [ ] Phase 3 — auth-service (template de référence)
- [ ] Phase 4 — Services métier (account, wallet, transaction, notification, gateway)
- [ ] Phase 5 — Frontend wallet complet
- [ ] Phase 6 — Observabilité, CI/CD, Kubernetes
