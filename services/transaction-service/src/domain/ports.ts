import type { Transaction } from './transaction.js'
import type { LedgerEntry } from './ledger-entry.js'
import type { WalletProjection } from './wallet-projection.js'
import type { MerchantProjection } from './merchant-projection.js'

// ===========================================================================
// PORTS — interfaces the use-cases depend on. Infrastructure provides the
// implementations (Prisma + Kafka). The domain stays free of any
// framework-specific imports.
// ===========================================================================

// ---------------------------------------------------------------------------
// WalletProjectionRepository — local read/write view of wallets.
// `findForUpdate*` acquires a pessimistic row lock (`SELECT ... FOR UPDATE`)
// so concurrent charges/refunds against the same wallet are serialised
// inside a single Postgres transaction.
// ---------------------------------------------------------------------------
export interface WalletProjectionRepository {
  findById(id: string): Promise<WalletProjection | null>
  findByMerchantId(merchantId: string): Promise<WalletProjection | null>
  // Lock-and-read variant. MUST be called from within a UnitOfWork
  // transaction or the lock has no effect beyond the SELECT itself.
  findForUpdateById(id: string): Promise<WalletProjection | null>
  // Insert a new projection row (called when consuming `wallet.created`).
  insert(wallet: WalletProjection): Promise<void>
  // Persist a mutated projection (balance changed during charge/refund,
  // or status changed via the wallet.status_changed event).
  update(wallet: WalletProjection): Promise<void>
}

// ---------------------------------------------------------------------------
// MerchantProjectionRepository — minimal local view of merchants. The
// use-case reads the status to decline operations initiated by an
// inactive merchant; the projection consumers (merchant.created,
// merchant.status_changed) write to it.
// ---------------------------------------------------------------------------
export interface MerchantProjectionRepository {
  findById(id: string): Promise<MerchantProjection | null>
  insert(merchant: MerchantProjection): Promise<void>
  update(merchant: MerchantProjection): Promise<void>
}

// ---------------------------------------------------------------------------
// TransactionRepository — the business fact log.
// `findByClientRequestId` is the entry point of the idempotency check
// that guards every POST /charges and POST /refunds call.
// ---------------------------------------------------------------------------
export interface TransactionRepository {
  findById(id: string): Promise<Transaction | null>
  findByClientRequestId(clientRequestId: string): Promise<Transaction | null>
  listByMerchantId(merchantId: string, limit: number, offset: number): Promise<Transaction[]>
  insert(transaction: Transaction): Promise<void>
}

// ---------------------------------------------------------------------------
// LedgerRepository — append-only journal. Entries are never updated or
// deleted; corrections happen via additional compensating entries.
// ---------------------------------------------------------------------------
export interface LedgerRepository {
  insertMany(entries: LedgerEntry[]): Promise<void>
  listByWalletId(walletId: string, limit: number, offset: number): Promise<LedgerEntry[]>
  // Entries belonging to a single transaction. Always returns 0 (for
  // declined transactions) or 2 (for completed transactions) rows in the
  // current double-entry model — order is chronological.
  listByTransactionId(transactionId: string): Promise<LedgerEntry[]>
  // Sum of debits for a given transaction id — used by refunds to check
  // that the refund amount does not exceed the original charge amount.
  // Returns the bigint sum in minor units, or 0n if no entries match.
  sumDebitsByTransactionId(transactionId: string): Promise<bigint>
}

// ---------------------------------------------------------------------------
// OutboxWriter — Transactional Outbox row appender. Must run inside the
// same Postgres transaction as the business write that produced the
// event. The relay worker publishes to Kafka asynchronously.
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
  merchants: MerchantProjectionRepository
  transactions: TransactionRepository
  ledger: LedgerRepository
  outbox: OutboxWriter
}

export interface UnitOfWork {
  withTransaction<T>(work: (ports: TransactionalPorts) => Promise<T>): Promise<T>
}
