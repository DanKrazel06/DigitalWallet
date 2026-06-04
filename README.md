# WalletDigital

A merchant-driven payment platform built as a learning project, with the engineering rigor of a real fintech: microservices, event-driven CQRS, double-entry ledger, transactional outbox, idempotent operations.

> **Status**: 3 microservices fully working end-to-end. Charges + refunds with immutable ledger, cross-service eventual consistency via Kafka, 29 unit tests passing.

---

## Domain model

The product is inspired by corporate PSPs (Brex, Ramp, Stripe Issuing) — **not** P2P wallets like Lydia or Wise. Two core actors:

- **Merchant** — an actor (`employee` or `company`) that owns funds. Created via `POST /merchants`. Every merchant automatically gets one wallet.
- **Wallet** — funds container belonging to one merchant. Mono-currency USD for this milestone, stored as `Decimal(20, 4)` in Postgres.

Two operations on transactions:

- **Charge** — debits a source wallet, credits a destination wallet. Atomic. Generates 2 ledger entries.
- **Refund** — reverses a previous completed charge. Generates 2 more ledger entries (immutable: refunds do not delete the original entries).

Why this model? It mirrors how real corporate-payment systems work: a parent merchant (e.g. an employer) initiates movements between accounts it manages. Cleaner than P2P for a learning project that wants to showcase ledger discipline.

---

## Architecture

Three services, each with its own Postgres database, communicating exclusively via Kafka events (no synchronous HTTP between services).

```
              POST /merchants
                    │
                    ▼
         ┌────────────────────┐
         │ merchant-service   │ ─── publishes merchant.created ─────┐
         │ port 3002          │                                      │
         │ DB: merchant       │                                      ▼
         └────────────────────┘                              Kafka walletdigital.merchant
                                                                     │
                                                                     ▼
                                                            ┌──────────────────────┐
                                                            │ wallet-service       │
                                                            │ port 3003            │
                                                            │ DB: wallet           │
                                                            │ ─ creates wallet     │
                                                            │ ─ publishes          │
                                                            │   wallet.created     │
                                                            └────────┬─────────────┘
                                                                     │
                                                                     ▼
                                                            Kafka walletdigital.wallet
                                                                     │
                                                                     ▼
              POST /charges, /refunds                       ┌──────────────────────┐
                    │                                       │ transaction-service  │
                    ▼                                       │ port 3004            │
         ┌──────────────────────┐                           │ DB: transaction      │
         │ transaction-service  │ ─── consumes wallet.*   ──┘ ─ keeps wallet      │
         │                      │     and merchant.*         projection in sync   │
         │ Atomic SQL tx:       │ ─── publishes charge/refund.completed/declined ─┐
         │  SELECT FOR UPDATE   │                                                  │
         │  + ledger writes     │                                                  ▼
         │  + outbox            │                                         Kafka walletdigital.transaction
         └──────────────────────┘                                                  │
                                                                                   ▼
                                                                          wallet-service consumes
                                                                          → mirrors balance changes
```

### Patterns implemented

- **Database per service** — strict isolation. No cross-service joins; cross-service data flows through Kafka projections.
- **Transactional Outbox** — every business write in Postgres is paired with an `outbox_events` row in the same transaction. A background relay publishes pending rows to Kafka, then marks them as published.
- **CQRS with local projections** — `transaction-service` keeps a local read-write copy of merchants and wallets, fed by Kafka events from the other services. Used as the source of truth for balances during a charge/refund.
- **Pessimistic locking** — `SELECT ... FOR UPDATE` on both wallets during a charge/refund prevents concurrent over-spending.
- **Idempotent operations** — every `POST /charges` and `POST /refunds` requires an `Idempotency-Key` header; replays return the original outcome with HTTP 200.
- **Double-entry immutable ledger** — every completed transaction produces exactly 2 ledger entries (debit + credit) that sum to zero. Declined transactions produce 0 ledger entries. Entries are append-only; corrections happen via compensating entries.
- **Hexagonal architecture** — domain layer has zero framework imports; use-cases depend on ports (interfaces), infrastructure provides Prisma/Kafka adapters.

---

## Repo structure

```
WalletDigital/
├── apps/
│   └── client/                       # React + Vite (scaffolded, not wired yet)
├── services/
│   ├── merchant-service/             # Merchant identity (id, name, type, status)
│   ├── wallet-service/               # Wallet provisioning + status
│   └── transaction-service/          # Charges, refunds, ledger (the hot path)
├── packages/
│   ├── shared-events/                # Zod schemas for every Kafka event
│   ├── shared-kafka/                 # KafkaJS wrapper (producer + consumer)
│   ├── shared-logger/                # Pino logger with secret redaction
│   ├── shared-money/                 # Money value object + Currency enum
│   ├── shared-prisma/                # Generic outbox-relay worker
│   └── shared-http/                  # Fastify error handler factory + BaseDomainError
├── infra/
│   ├── docker-compose.yml            # Postgres / Mongo / Redis / Redpanda / Mailhog
│   └── postgres/init/                # DB-per-service init script
└── pnpm-workspace.yaml
```

Each microservice follows hexagonal layout: `src/domain/`, `src/application/`, `src/infrastructure/`, `src/interfaces/http/`.

---

## Tech stack

| Concern             | Choice                                                                     |
| ------------------- | -------------------------------------------------------------------------- |
| Runtime             | Node.js 20+                                                                |
| Language            | TypeScript (strict, ESM)                                                   |
| Monorepo            | pnpm workspaces + Turborepo                                                |
| HTTP framework      | Fastify v5 + Zod type provider                                             |
| ORM                 | Prisma 6 (with `prisma migrate dev`)                                       |
| Database            | PostgreSQL 17 (one DB per service)                                         |
| Event bus           | Kafka via **Redpanda** (Kafka API-compatible, single-binary, no ZooKeeper) |
| Cache / sessions    | Redis 7                                                                    |
| Email capture (dev) | Mailhog                                                                    |
| Tests               | Vitest + in-memory fakes                                                   |
| Logging             | Pino (structured JSON in prod, pretty in dev)                              |

---

## Prerequisites

- **Node.js >= 20**
- **pnpm >= 10** — install via `npm i -g pnpm`
- **Docker Desktop** — required for Postgres + Kafka + Redis
- Windows users: PowerShell 5.1+ (commands below work on Windows, macOS and Linux unless noted)

---

## Setup

### 1. Clone and install

```bash
git clone <repo-url> WalletDigital
cd WalletDigital
pnpm install
```

This installs all workspace dependencies (~350 packages, ~25s).

### 2. Provision environment files

```bash
# Root .env for infra
cp .env.example .env

# Per-service .env files
cp services/merchant-service/.env.example services/merchant-service/.env
cp services/wallet-service/.env.example services/wallet-service/.env
cp services/transaction-service/.env.example services/transaction-service/.env
```

Adjust passwords/secrets as needed. **Defaults work for local dev** out of the box.

### 3. Start infrastructure

```bash
pnpm infra:up
```

This spins up:

| Service          | Port                           | UI                                       |
| ---------------- | ------------------------------ | ---------------------------------------- |
| PostgreSQL 17    | 5433 (host) → 5432 (container) | —                                        |
| MongoDB 7        | 27017                          | —                                        |
| Redis 7          | 6379                           | —                                        |
| Kafka (Redpanda) | 9092                           | http://localhost:8080 (Redpanda Console) |
| Mailhog SMTP     | 1025                           | http://localhost:8025                    |

> **Note**: Postgres is intentionally on host port **5433**, not 5432 — works around a known Docker Desktop + Prisma SCRAM authentication bug on Windows. Container-to-container connections still use the default `:5432`.

The three service databases (`merchant`, `wallet`, `transaction`) are auto-created on the first run by `infra/postgres/init/01-create-databases.sh`.

### 4. Create Kafka topics

```bash
docker exec wd-redpanda rpk topic create \
  walletdigital.merchant walletdigital.wallet walletdigital.transaction \
  --partitions 3 --replicas 1
```

(Redpanda's auto-topic-creation is also enabled, so you can skip this — partitions will default to 1.)

### 5. Run Prisma migrations

```bash
cd services/merchant-service && pnpm prisma migrate deploy && cd -
cd services/wallet-service && pnpm prisma migrate deploy && cd -
cd services/transaction-service && pnpm prisma migrate deploy && cd -
```

### 6. Start the services

Open three terminals:

```bash
# Terminal 1
cd services/merchant-service && pnpm dev

# Terminal 2
cd services/wallet-service && pnpm dev

# Terminal 3
cd services/transaction-service && pnpm dev
```

Each service runs on its own port (3002, 3003, 3004) and exposes a `GET /health` endpoint.

Alternatively, from the repo root you can run `pnpm dev` to launch everything in parallel via Turborepo — handy but logs are interleaved.

---

## End-to-end demo

```bash
# 1. Create two merchants
ALICE=$(curl -s -X POST http://localhost:3002/merchants \
  -H 'Content-Type: application/json' \
  -d '{"name":"Alice","type":"employee"}')
ACME=$(curl -s -X POST http://localhost:3002/merchants \
  -H 'Content-Type: application/json' \
  -d '{"name":"Acme","type":"company"}')

ALICE_ID=$(echo "$ALICE" | jq -r .merchantId)
ACME_ID=$(echo "$ACME" | jq -r .merchantId)

# 2. Wait ~3s for Kafka cascade (merchant.created → wallet.created)
sleep 3

# 3. Fetch the auto-provisioned wallets
ALICE_WALLET=$(curl -s http://localhost:3003/wallets/by-merchant/$ALICE_ID | jq -r .id)
ACME_WALLET=$(curl -s http://localhost:3003/wallets/by-merchant/$ACME_ID | jq -r .id)

# 4. Top up Alice's wallet (direct SQL for now — TODO: dedicated endpoint)
docker exec wd-postgres psql -U walletdigital -d wallet \
  -c "UPDATE wallets SET balance = 1000.00 WHERE id = '$ALICE_WALLET';"
docker exec wd-postgres psql -U walletdigital -d transaction \
  -c "UPDATE wallets SET balance = 1000.00 WHERE id = '$ALICE_WALLET';"

# 5. Charge: Alice → Acme, 100 USD (in minor units: 10000)
curl -X POST http://localhost:3004/charges \
  -H 'Content-Type: application/json' \
  -H "Idempotency-Key: $(uuidgen)" \
  -d "{
    \"merchantId\": \"$ACME_ID\",
    \"fromWalletId\": \"$ALICE_WALLET\",
    \"toWalletId\": \"$ACME_WALLET\",
    \"amount\": \"10000\",
    \"currency\": \"USD\"
  }"

# Both services now show Alice: 900 USD, Acme: 100 USD.
```

---

## HTTP API

### merchant-service (`:3002`)

| Method  | Path                    | Description                                        |
| ------- | ----------------------- | -------------------------------------------------- | ------------- |
| `POST`  | `/merchants`            | Create a merchant. Body: `{ name, type: 'employee' | 'company' }`  |
| `PATCH` | `/merchants/:id/status` | Toggle status. Body: `{ status: 'active'           | 'inactive' }` |
| `GET`   | `/merchants/:id`        | Fetch a merchant                                   |

### wallet-service (`:3003`)

| Method  | Path                               | Description                          |
| ------- | ---------------------------------- | ------------------------------------ |
| `GET`   | `/wallets/:id`                     | Fetch a wallet by id                 |
| `GET`   | `/wallets/by-merchant/:merchantId` | Fetch the wallet owned by a merchant |
| `PATCH` | `/wallets/:id/status`              | Toggle wallet status                 |

### transaction-service (`:3004`)

| Method | Path                                    | Description                                                           |
| ------ | --------------------------------------- | --------------------------------------------------------------------- |
| `POST` | `/charges`                              | Create a charge. Header `Idempotency-Key` required                    |
| `POST` | `/refunds`                              | Refund a charge. Header `Idempotency-Key` required                    |
| `GET`  | `/transactions/:id`                     | Fetch a transaction                                                   |
| `GET`  | `/transactions/by-merchant/:merchantId` | List transactions for a merchant (paginated)                          |
| `GET`  | `/transactions/:id/ledger-entries`      | List ledger entries for a transaction (0 if declined, 2 if completed) |
| `GET`  | `/wallets/:id/ledger-entries`           | List ledger entries for a wallet (paginated)                          |

All money fields on the wire are **strings of minor units** (cents). The `balance` of 100 USD is sent as `"10000"`.

---

## Testing

29 unit tests on `transaction-service` (the most critical service):

```bash
cd services/transaction-service
pnpm test                    # ~1 second, 29 tests
pnpm exec vitest run --coverage   # HTML report in coverage/index.html
```

Coverage on the domain + critical use-cases:

- `domain/money.ts` — 100%
- `domain/transaction.ts` — 100%
- `application/create-charge.use-case.ts` — 93.6%
- `application/create-refund.use-case.ts` — 83.8%

Tests use **in-memory fakes** (`tests/fakes/`) — no Docker, no DB, no Kafka. This is the payoff of hexagonal architecture: the entire critical money-handling logic runs in milliseconds.

---

## Cleanup

```bash
pnpm infra:down    # Stop containers, KEEP volumes (data preserved)
pnpm infra:reset   # Stop and DELETE all volumes (clean slate)
```

---

## Tradeoffs and explicit limitations

This is a learning project, not a production system. Choices were made — here's the honest accounting.

### What's deliberately out of scope

- **Authentication / authorization** — no API keys, no JWT, no merchant identity check on `POST /charges`. Anyone with network access can do anything. A production system would have an API gateway with merchant API keys, but it's a clear cut to keep the focus on the data flow.
- **Multi-currency and FX rates** — mono-USD only. The `Currency` enum is centralized so adding `EUR` later is a one-line change, but FX conversion is not implemented.
- **Top-up endpoint** — adding initial funds to a wallet still requires a direct SQL `UPDATE`. A `POST /top-ups` endpoint with a system-wallet pattern is sketched in the docs but not built.
- **Partial multiple refunds** — a charge can be refunded only once (full or partial amount). Production systems usually allow N refunds as long as their sum ≤ original amount.
- **Webhooks** — no outbound webhooks to notify merchants of completed/declined transactions.
- **Notification service** — initially planned (consume events, send emails via Mailhog) but cut to focus on the money-handling core.
- **Frontend** — `apps/client` is a Vite scaffold, not wired to the backend.
- **Dockerfiles** — services run via `pnpm dev`. No production Docker images yet.
- **CI/CD** — no GitHub Actions pipeline; tests are run manually.

### What's intentionally simple (could be hardened)

- **Outbox relay** uses polling (every 500ms) instead of Postgres `LISTEN/NOTIFY` or a Debezium CDC pipeline. Simpler to reason about; latency floor of 500ms.
- **Idempotency dedupe for the wallet sync consumer** is not implemented. If `charge.completed` is redelivered (Kafka at-least-once), the wallet balance will double-decrement. A real system would store processed `transactionId`s in Redis with a TTL. Documented inline in `ApplyTransactionToWalletsUseCase`.
- **Pessimistic locking via `SELECT FOR UPDATE`** is the simplest correct choice but doesn't scale beyond a single Postgres primary. A high-throughput system would shard by wallet or use optimistic concurrency with version numbers.
- **No retry / dead-letter queue** for Kafka consumers. A poison message logs the error and is skipped (the consumer keeps moving) — see `@walletdigital/kafka`. Production code would route it to a DLQ topic.
- **Wallet balance discrepancy window** — between the time a charge commits in `transaction-service` and the time `wallet-service` consumes the event (~200ms typically), the two services report different balances for the same wallet. Documented as **eventually consistent**.

### What's explicit about the data model

- **Money is bigint everywhere in code, Decimal(20, 4) in Postgres.** Never floats. The `Money` value object enforces same-currency arithmetic and refuses to be JSON-serialized as a float — only as a minor-unit string. This is the single most important invariant of the system.
- **Ledger entries are append-only.** No `UPDATE`, no `DELETE`. Refunds produce new entries instead of mutating existing ones. This is required for any system that wants to claim "auditability".
- **One wallet per merchant.** Mono-currency assumption. Multi-currency would relax this to `UNIQUE (merchantId, currency)`.

### What I'd do differently with hindsight

- **Reduce duplication of `Money`-related code at the Prisma boundary.** Each repository has a small `toDomain` that does the Decimal ↔ Money translation; could be a higher-order Prisma extension.
- **Consumer group IDs should embed a version number** (`wallet-service-transaction-v1`). On a breaking event schema change you can roll forward without rebalance storms.
- **A single `system-wallet` provisioned at boot** would have removed the need for SQL `UPDATE` in the demo flow. It's a missed opportunity — half a day's work.

---

## License

Personal learning project. No license declared. Don't deploy this anywhere with real money.
