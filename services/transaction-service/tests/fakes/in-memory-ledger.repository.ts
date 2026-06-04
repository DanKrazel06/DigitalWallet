import type { LedgerEntry } from '../../src/domain/ledger-entry.js'
import type { LedgerRepository } from '../../src/domain/ports.js'

// InMemoryLedgerRepository — append-only fake for tests.
export class InMemoryLedgerRepository implements LedgerRepository {
  private readonly entries: LedgerEntry[] = []

  // Test helper: all entries in insertion order.
  all(): LedgerEntry[] {
    return [...this.entries]
  }

  async insertMany(entries: LedgerEntry[]): Promise<void> {
    this.entries.push(...entries)
  }

  async listByWalletId(walletId: string, limit: number, offset: number): Promise<LedgerEntry[]> {
    const filtered = this.entries
      .filter((e) => e.walletId === walletId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    return filtered.slice(offset, offset + limit)
  }

  async listByTransactionId(transactionId: string): Promise<LedgerEntry[]> {
    return this.entries
      .filter((e) => e.transactionId === transactionId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
  }

  async sumDebitsByTransactionId(transactionId: string): Promise<bigint> {
    return this.entries.filter((e) => e.transactionId === transactionId).reduce((sum, e) => sum + e.debit.amount, 0n)
  }
}
