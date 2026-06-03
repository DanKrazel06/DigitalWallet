import type { Transaction } from './transaction.js'
import type { LedgerEntry } from './ledger-entry.js'
import type { WalletProjection } from './wallet-projection.js'

// ===========================================================================
// PORTS — interfaces the use-cases depend on. Infrastructure provides the
// implementations (Prisma + Kafka). The domain stays free of any
// framework-specific imports.
// ===========================================================================

// ---------------------------------------------------------------------------
// WalletProjectionRepository — local read/write view of wallets.
// `findForUpdate*` acquires a pessimistic row lock (`SELECT ... FOR UPDATE`)
// so concurrent transfers from / to the same wallet are serialised inside
// a single Postgres transaction.
// ---------------------------------------------------------------------------
export interface WalletProjectionRepository {
  findByUserId(userId: string): Promise<WalletProjection | null>
  findById(id: string): Promise<WalletProjection | null>
  // Lock-and-read variants. MUST be called from within a UnitOfWork
  // transaction or the lock has no effect beyond the SELECT itself.
  findForUpdateByUserId(userId: string): Promise<WalletProjection | null>
  // Insert a new projection row (called when consuming `wallet.created`).
  insert(wallet: WalletProjection): Promise<void>
  // Persist a mutated projection (balance changed during a transfer).
  update(wallet: WalletProjection): Promise<void>
}

// ---------------------------------------------------------------------------
// TransactionRepository — the business fact log.
// `findByIdempotencyKey` is the entry point of the idempotency check that
// guards every POST /transactions call.
// ---------------------------------------------------------------------------
export interface TransactionRepository {
  findById(id: string): Promise<Transaction | null>
  findByIdempotencyKey(key: string): Promise<Transaction | null>
  listByUserId(userId: string, limit: number, offset: number): Promise<Transaction[]>
  insert(transaction: Transaction): Promise<void>
}

// ---------------------------------------------------------------------------
// LedgerRepository — append-only journal. Entries are never updated or
// deleted; corrections happen via additional compensating entries.
// ---------------------------------------------------------------------------
export interface LedgerRepository {
  insertMany(entries: LedgerEntry[]): Promise<void>
  listByWalletId(walletId: string, limit: number): Promise<LedgerEntry[]>
}

// ---------------------------------------------------------------------------
// OutboxWriter — append a row inside the SAME Postgres transaction as the
// business write. Same Transactional Outbox pattern as the other services.
// ---------------------------------------------------------------------------
export interface OutboxWriter {
  append(input: { aggregateId: string; topic: string; payload: unknown }): Promise<void>
}

// ---------------------------------------------------------------------------
// UnitOfWork — wraps a Postgres transaction. Use-cases call
// `withTransaction(async (ports) => { ... })` to perform multiple writes
// atomically. The ports passed to the callback are TRANSACTIONAL copies
// of every repository involved — they share the same `tx` client behind
// the scenes so locks and writes commit or roll back together.
// ---------------------------------------------------------------------------
export interface TransactionalPorts {
  wallets: WalletProjectionRepository
  transactions: TransactionRepository
  ledger: LedgerRepository
  outbox: OutboxWriter
}

export interface UnitOfWork {
  withTransaction<T>(work: (ports: TransactionalPorts) => Promise<T>): Promise<T>
}
