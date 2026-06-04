import type { Wallet } from './wallet.js'

// Ports declared by the wallet-service domain.
export interface WalletRepository {
  findByMerchantId(merchantId: string): Promise<Wallet | null>
  findById(id: string): Promise<Wallet | null>
  // `save` upserts so the same method works for create (from the merchant
  // event consumer / POST /wallets) and update (status changes, balance
  // sync from transaction.completed).
  save(wallet: Wallet): Promise<void>
}

export interface OutboxWriter {
  append(input: { aggregateId: string; topic: string; payload: unknown }): Promise<void>
}

export interface TransactionalPorts {
  wallets: WalletRepository
  outbox: OutboxWriter
}

export interface UnitOfWork {
  withTransaction<T>(work: (ports: TransactionalPorts) => Promise<T>): Promise<T>
}
