import type { Transaction } from '../../src/domain/transaction.js'
import type { TransactionRepository } from '../../src/domain/ports.js'

// InMemoryTransactionRepository — fake for unit tests. Indexed by id
// and by clientRequestId so the idempotency lookup is O(1).
export class InMemoryTransactionRepository implements TransactionRepository {
  private readonly byId = new Map<string, Transaction>()
  private readonly byClientRequestId = new Map<string, Transaction>()

  // Test helper: snapshot of all stored transactions in insertion order.
  all(): Transaction[] {
    return Array.from(this.byId.values())
  }

  async findById(id: string): Promise<Transaction | null> {
    return this.byId.get(id) ?? null
  }

  async findByClientRequestId(clientRequestId: string): Promise<Transaction | null> {
    return this.byClientRequestId.get(clientRequestId) ?? null
  }

  async listByMerchantId(merchantId: string, limit: number, offset: number): Promise<Transaction[]> {
    const all = Array.from(this.byId.values())
      .filter((t) => t.merchantId === merchantId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    return all.slice(offset, offset + limit)
  }

  async insert(transaction: Transaction): Promise<void> {
    if (this.byClientRequestId.has(transaction.clientRequestId)) {
      throw Object.assign(new Error('unique violation'), { code: 'P2002' })
    }
    this.byId.set(transaction.id, transaction)
    this.byClientRequestId.set(transaction.clientRequestId, transaction)
  }
}
