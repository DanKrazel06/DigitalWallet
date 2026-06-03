import type { Account } from './account.js'

// ===========================================================================
// PORTS — interfaces declared by the account-service domain.
// Same hexagonal pattern as auth-service: use-cases depend on these
// abstractions, infrastructure provides the implementations.
// ===========================================================================

export interface AccountRepository {
  findByUserId(userId: string): Promise<Account | null>
  findById(id: string): Promise<Account | null>
  save(account: Account): Promise<void>
}

export interface OutboxWriter {
  append(input: {
    aggregateId: string
    topic: string
    payload: unknown
  }): Promise<void>
}

export interface TransactionalPorts {
  accounts: AccountRepository
  outbox: OutboxWriter
}

export interface UnitOfWork {
  withTransaction<T>(work: (ports: TransactionalPorts) => Promise<T>): Promise<T>
}
