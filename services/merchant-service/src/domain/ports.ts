import type { Merchant } from './merchant.js'

// ===========================================================================
// PORTS — interfaces the use-cases depend on. Infrastructure provides the
// implementations (Prisma). The domain stays free of any framework imports.
// ===========================================================================

export interface MerchantRepository {
  findById(id: string): Promise<Merchant | null>
  save(merchant: Merchant): Promise<void>
}

// OutboxWriter — Transactional Outbox row appender. Must run inside the
// same Postgres transaction as the business write that produced the
// event. The relay worker publishes to Kafka asynchronously.
export interface OutboxWriter {
  append(input: { aggregateId: string; topic: string; payload: unknown }): Promise<void>
}

// UnitOfWork — wraps a Postgres transaction so use-cases can run
// multiple writes atomically with shared `tx` ports.
export interface TransactionalPorts {
  merchants: MerchantRepository
  outbox: OutboxWriter
}

export interface UnitOfWork {
  withTransaction<T>(work: (ports: TransactionalPorts) => Promise<T>): Promise<T>
}
