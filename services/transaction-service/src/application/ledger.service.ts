import { TransactionNotFoundError, WalletNotFoundError } from '../domain/errors.js'
import type { LedgerEntry } from '../domain/ledger-entry.js'
import type { LedgerRepository, TransactionRepository, WalletProjectionRepository } from '../domain/ports.js'
import type { LedgerEntryDto, ListLedgerByTransactionInput, ListLedgerByWalletInput } from './ledger.dto.js'

// LedgerService — read-side queries over the immutable ledger. Used by
// the HTTP routes exposed by transaction-service:
//   - GET /wallets/:id/ledger-entries
//   - GET /transactions/:id/ledger-entries
//
// We resolve the parent wallet / transaction first so 404s are returned
// instead of an empty array when the referenced entity does not exist.
export class LedgerService {
  constructor(
    private readonly ledger: LedgerRepository,
    private readonly wallets: WalletProjectionRepository,
    private readonly transactions: TransactionRepository,
  ) {}

  // -------------------------------------------------------------------------
  // listByWalletId — every ledger movement on a single wallet, most
  // recent first. 404 if the wallet does not exist in our projection.
  // -------------------------------------------------------------------------
  async listByWalletId(input: ListLedgerByWalletInput): Promise<LedgerEntryDto[]> {
    const wallet = await this.wallets.findById(input.walletId)
    if (wallet === null) {
      throw new WalletNotFoundError(input.walletId)
    }
    const limit = Math.min(input.limit ?? 50, 200)
    const offset = input.offset ?? 0
    const entries = await this.ledger.listByWalletId(input.walletId, limit, offset)
    return entries.map(toDto)
  }

  // -------------------------------------------------------------------------
  // listByTransactionId — entries attached to one transaction (always 0
  // for declined, 2 for completed in the current model). 404 if the
  // transaction does not exist.
  // -------------------------------------------------------------------------
  async listByTransactionId(input: ListLedgerByTransactionInput): Promise<LedgerEntryDto[]> {
    const tx = await this.transactions.findById(input.transactionId)
    if (tx === null) {
      throw new TransactionNotFoundError()
    }
    const entries = await this.ledger.listByTransactionId(input.transactionId)
    return entries.map(toDto)
  }
}

function toDto(entry: LedgerEntry): LedgerEntryDto {
  return {
    id: entry.id,
    transactionId: entry.transactionId,
    type: entry.type,
    walletId: entry.walletId,
    debit: entry.debit.toMinorString(),
    credit: entry.credit.toMinorString(),
    balanceAfter: entry.balanceAfter.toMinorString(),
    currency: entry.debit.currency,
    createdAt: entry.createdAt.toISOString(),
  }
}
