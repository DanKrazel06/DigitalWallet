// Structural type describing the minimal surface of a Prisma client that
// the outbox relay needs. Each service generates its own concrete
// PrismaClient from its own schema — that type structurally satisfies
// this interface because every Prisma client exposes `$transaction` and
// `$queryRawUnsafe`, plus an `outboxEvent` delegate (provided every
// schema declares a model named `OutboxEvent` mapped to `outbox_events`).
//
// We DON'T import @prisma/client here: this package must stay
// schema-agnostic and reusable across all microservices.

export interface OutboxRow {
  id: string
  aggregate_id: string
  topic: string
  payload: unknown
}

// Just enough to update the published_at column of an outbox row.
export interface OutboxDelegate {
  update(args: { where: { id: string }; data: { publishedAt: Date } }): Promise<unknown>
}

// The transactional Prisma client (the `tx` argument inside `$transaction`).
export interface PrismaTxClient {
  outboxEvent: OutboxDelegate
  $queryRawUnsafe<T = unknown>(query: string, ...params: unknown[]): Promise<T>
}

// Subset of the root PrismaClient used by the relay.
export interface PrismaRootClient {
  $transaction<T>(
    fn: (tx: PrismaTxClient) => Promise<T>,
    options?: { timeout?: number; maxWait?: number },
  ): Promise<T>
}
