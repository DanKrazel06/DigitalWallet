import type { Wallet } from './wallet.js'
import type { Currency } from './money.js'

// Ports declared by the wallet-service domain.
export interface WalletRepository {
  findByUserAndCurrency(userId: string, currency: Currency): Promise<Wallet | null>
  findAllByUserId(userId: string): Promise<Wallet[]>
  findById(id: string): Promise<Wallet | null>
  save(wallet: Wallet): Promise<void>
}

export interface OutboxWriter {
  append(input: {
    aggregateId: string
    topic: string
    payload: unknown
  }): Promise<void>
}

export interface TransactionalPorts {
  wallets: WalletRepository
  outbox: OutboxWriter
}

export interface UnitOfWork {
  withTransaction<T>(work: (ports: TransactionalPorts) => Promise<T>): Promise<T>
}
