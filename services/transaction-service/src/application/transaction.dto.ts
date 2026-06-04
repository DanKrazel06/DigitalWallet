import type { Currency } from '../domain/money.js'
import type { TransactionStatus, TransactionType } from '../domain/transaction.js'

// Public-facing transaction representation. Money fields are serialised
// as decimal strings of minor units (cents) — never as floats.
export interface TransactionDto {
  id: string
  type: TransactionType
  clientRequestId: string
  originalTransactionId: string | null
  merchantId: string
  fromWalletId: string
  toWalletId: string
  amount: string
  currency: Currency
  status: TransactionStatus
  declineReason: string | null
  createdAt: string
}

export interface GetTransactionInput {
  id: string
}

export interface ListTransactionsByMerchantInput {
  merchantId: string
  limit?: number
  offset?: number
}
