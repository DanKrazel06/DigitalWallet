import type { Currency } from '../domain/money.js'
import type { TransactionType } from '../domain/transaction.js'

// Public-facing ledger entry representation. Money fields are serialised
// as decimal strings of minor units (cents).
export interface LedgerEntryDto {
  id: string
  transactionId: string
  type: TransactionType
  walletId: string
  debit: string
  credit: string
  balanceAfter: string
  currency: Currency
  createdAt: string
}

export interface ListLedgerByWalletInput {
  walletId: string
  limit?: number
  offset?: number
}

export interface ListLedgerByTransactionInput {
  transactionId: string
}
