# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> The project root is `DigitalWallet/` (a subdirectory of the workspace). All commands below run from there unless noted.

## Commands

Monorepo orchestration runs through pnpm + Turborepo. From the repo root:

```bash
pnpm dev          # start every service in parallel (interleaved logs)
pnpm build        # tsc build across all packages (respects ^build dep order)
pnpm lint         # eslint --max-warnings=0 everywhere
pnpm typecheck    # tsc --noEmit everywhere
pnpm test         # vitest run across all packages
pnpm format       # prettier --write on the whole tree
```

Per-service work (e.g. `services/transaction-service/`):

```bash
pnpm dev                 # tsx watch src/main.ts (hot reload)
pnpm test                # vitest run
pnpm test:watch          # vitest watch
pnpm exec vitest run path/to/file.test.ts          # single test file
pnpm exec vitest run -t "substring of test name"   # single test by name
pnpm exec vitest run --coverage                     # coverage → coverage/index.html
pnpm prisma:migrate      # prisma migrate dev (creates + applies a migration)
pnpm prisma:generate     # regenerate the Prisma client
pnpm prisma:studio       # browse the DB
```

Infrastructure (Docker; run from repo root, needs `.env`):

```bash
pnpm infra:up      # start Postgres / Mongo / Redis / Redpanda / Mailhog
pnpm infra:down    # stop, keep volumes
pnpm infra:reset   # stop and DELETE volumes (clean slate)
```

First-time setup: copy every `.env.example` to `.env` (root + each service), `pnpm infra:up`, then `pnpm prisma migrate deploy` inside each of the three services. Full walkthrough and an end-to-end curl demo are in [README.md](README.md).

> **Postgres is on host port 5433**, not 5432 — a deliberate workaround for a Docker Desktop + Prisma SCRAM auth bug on Windows. Container-to-container traffic still uses 5432.

## Architecture

A merchant-driven payment platform. Three microservices, **each with its own Postgres database**, communicating **exclusively via Kafka events** (Redpanda) — there is no synchronous HTTP between services.

```
merchant-service (:3002) ──merchant.created──▶ wallet-service (:3003) ──wallet.created──▶ transaction-service (:3004)
        DB: merchant                                DB: wallet                                    DB: transaction
                                                                                          (consumes wallet.* + merchant.*
                                                                                           into local projections;
                                                                                           publishes charge/refund events
                                                                                           back to wallet-service)
```

`transaction-service` is the hot path: charges and refunds with the double-entry ledger. The other two are mostly identity/provisioning.

### Cross-cutting patterns (read these before touching service code)

- **Hexagonal layout** in every service: `src/domain/` (zero framework imports — pure value objects + entities), `src/application/` (use-cases depending on `domain/ports.ts` interfaces), `src/infrastructure/` (Prisma + Kafka adapters implementing those ports), `src/interfaces/http/` (Fastify routes). `src/main.ts` is the composition root that wires everything.
- **Transactional Outbox** — a business write and its `outbox_events` row commit in the same Postgres transaction. `createOutboxRelay` (in `packages/shared-prisma/src/outbox-relay.ts`, shared by all services) polls the table every 500ms with `FOR UPDATE SKIP LOCKED`, publishes to Kafka, marks rows published. **At-least-once delivery — consumers must be idempotent.**
- **CQRS local projections** — `transaction-service` keeps its own read/write copies of merchants and wallets, fed by Kafka consumers (`*-event.consumer.ts`). These projections are the source of truth for balances during a charge/refund, not a cross-service query.
- **UnitOfWork** (`domain/ports.ts`) — use-cases do multi-write atomic work via `uow.withTransaction(async (ports) => …)`. The `ports` passed to the callback are **transactional copies** of every repository sharing one Prisma `tx`, so locks/writes commit or roll back together. Never mix the non-transactional repos with the transactional ones inside a tx.
- **Pessimistic locking** — charges/refunds lock both wallets with `findForUpdateById` (`SELECT … FOR UPDATE`) **in deterministic id order (smallest first)** to avoid deadlocks on opposing concurrent transfers. Locks only hold inside a `withTransaction`.
- **Idempotency** — every `POST /charges` and `POST /refunds` requires an `Idempotency-Key` header (mapped to `clientRequestId`). The use-case checks it twice: a fast path outside the tx, then a re-check inside the tx to cover the concurrent-replay race. Replays return the original outcome.
- **Double-entry immutable ledger** — a completed transaction produces exactly 2 ledger entries (debit + credit summing to zero); a declined transaction produces 0. Ledger rows are **append-only** — never `UPDATE`/`DELETE` them; corrections are compensating entries. Refunds add new entries rather than mutating the original charge.

### Money — the central invariant

All money is `bigint` in **minor units (cents)** in code, `Decimal(20, 4)` in Postgres, and **strings of minor units on the wire** (100 USD → `"10000"`). Never floats. Use the `Money` value object (`packages/shared-money`) for all arithmetic — it enforces same-currency operations (throws on mismatch) and refuses to serialise as a float. This is the single most important rule in the codebase. Mono-currency USD for now; the `Currency` enum is centralised so adding EUR is localised.

### Events

Every Kafka event is wrapped in the envelope from `packages/shared-events/src/envelope.ts` (`eventId`, `occurredAt`, `type`, `version`, optional `correlationId`) — build it with `buildEnvelope(type)`. Payload schemas are Zod, defined per aggregate in `packages/shared-events/src/events/`. Topics are in `topics.ts` (`walletdigital.merchant`, `walletdigital.wallet`, `walletdigital.transaction`).

### Shared packages

Workspace deps are imported as `@walletdigital/<name>` but **the directory is `packages/shared-<name>`** (e.g. `@walletdigital/events` ← `packages/shared-events`). Notable: `@walletdigital/kafka` (KafkaJS wrapper; a poison message is logged and skipped — no DLQ), `@walletdigital/logger` (Pino with secret redaction), `@walletdigital/http` (Fastify error-handler factory + `BaseDomainError`).

## Conventions

- **ESM + TypeScript strict.** Config in `tsconfig.base.json` — note `noUncheckedIndexedAccess`, `noUnusedLocals`/`Parameters`. **Relative imports must carry the `.js` extension** (`from './money.js'`), even though the source file is `.ts` — this is required by the ESM `Bundler` resolution. Match this in every new import.
- **Testing is in-memory.** `transaction-service` tests use fakes in `tests/fakes/` (in-memory repositories + UnitOfWork) — no Docker, no DB, no Kafka. The domain and critical use-cases run in milliseconds. New domain/use-case logic should be testable the same way; add a fake rather than mocking Prisma.
- **Commits are Conventional Commits**, enforced by commitlint + a husky `commit-msg` hook. A husky `pre-commit` hook runs lint-staged (`eslint --fix` + `prettier`). Don't bypass these.

## Known sharp edges (documented tradeoffs, not bugs to "fix" silently)

- The wallet-sync consumer in `wallet-service` is **not idempotent** — a redelivered `charge.completed` would double-apply. Documented inline in `ApplyTransactionToWalletsUseCase`.
- Topping up a wallet has no endpoint yet — the demo does a direct SQL `UPDATE` (see README).
- `transaction-service` and `wallet-service` report a wallet's balance with an eventual-consistency lag (~200ms) — by design.
- No auth, no multi-currency/FX, no DLQ, no Dockerfiles, no CI. `apps/client` is a Vite scaffold not wired to the backend. See the "Tradeoffs" section of [README.md](README.md) for the full list.
