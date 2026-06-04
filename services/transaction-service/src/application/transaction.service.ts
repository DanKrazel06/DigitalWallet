import { TransactionNotFoundError } from '../domain/errors.js'
import type { Transaction } from '../domain/transaction.js'
import type { TransactionRepository } from '../domain/ports.js'
import type { GetTransactionInput, ListTransactionsByMerchantInput, TransactionDto } from './transaction.dto.js'

// TransactionService — read-side operations on transactions (charges and
// refunds). Write operations live in dedicated use-cases.
export class TransactionService {
  constructor(private readonly transactions: TransactionRepository) {}

  // -------------------------------------------------------------------------
  // getById — fetch a single transaction or 404.
  // -------------------------------------------------------------------------
  async getById(input: GetTransactionInput): Promise<TransactionDto> {
    const tx = await this.transactions.findById(input.id)
    if (tx === null) {
      throw new TransactionNotFoundError()
    }
    return toDto(tx)
  }

  // -------------------------------------------------------------------------
  // listByMerchantId — paginated history for a given merchant.
  // -------------------------------------------------------------------------
  async listByMerchantId(input: ListTransactionsByMerchantInput): Promise<TransactionDto[]> {
    const limit = Math.min(input.limit ?? 50, 200)
    const offset = input.offset ?? 0
    const txs = await this.transactions.listByMerchantId(input.merchantId, limit, offset)
    return txs.map(toDto)
  }
}

function toDto(tx: Transaction): TransactionDto {
  return {
    id: tx.id,
    type: tx.type,
    clientRequestId: tx.clientRequestId,
    originalTransactionId: tx.originalTransactionId,
    merchantId: tx.merchantId,
    fromWalletId: tx.fromWalletId,
    toWalletId: tx.toWalletId,
    amount: tx.amount.toMinorString(),
    currency: tx.amount.currency,
    status: tx.status,
    declineReason: tx.declineReason,
    createdAt: tx.createdAt.toISOString(),
  }
}
