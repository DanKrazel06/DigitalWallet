import { TransactionNotFoundError } from '../domain/errors.js'
import type { Transaction } from '../domain/transaction.js'
import type { TransactionRepository } from '../domain/ports.js'
import type {
  GetTransactionInput,
  ListTransactionsByUserInput,
  TransactionDto,
} from './transaction.dto.js'

// TransactionService — read-side operations.
// Write operation (POST /transactions) lives in CreateTransferUseCase
// because it carries a heavy transactional + ledger + outbox concern.
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
  // listByUserId — paginated history of incoming AND outgoing transfers
  // for a given user. Always returns an array, possibly empty.
  // -------------------------------------------------------------------------
  async listByUserId(input: ListTransactionsByUserInput): Promise<TransactionDto[]> {
    const limit = Math.min(input.limit ?? 50, 200)
    const offset = input.offset ?? 0
    const txs = await this.transactions.listByUserId(input.userId, limit, offset)
    return txs.map(toDto)
  }
}

function toDto(tx: Transaction): TransactionDto {
  return {
    id: tx.id,
    idempotencyKey: tx.idempotencyKey,
    fromUserId: tx.fromUserId,
    toUserId: tx.toUserId,
    fromWalletId: tx.fromWalletId,
    toWalletId: tx.toWalletId,
    amount: tx.amount.toMinorString(),
    currency: tx.amount.currency,
    status: tx.status,
    failureReason: tx.failureReason,
    createdAt: tx.createdAt.toISOString(),
  }
}
