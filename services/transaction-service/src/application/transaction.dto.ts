import type { Currency } from '../domain/money.js'
import type { TransactionStatus } from '../domain/transaction.js'

// Public-facing transaction representation. Money fields are serialised
// as decimal strings of minor units (cents) — never as floats.
export interface TransactionDto {
  id: string
  idempotencyKey: string
  fromUserId: string
  toUserId: string
  fromWalletId: string
  toWalletId: string
  amount: string
  currency: Currency
  status: TransactionStatus
  failureReason: string | null
  createdAt: string
}

export interface GetTransactionInput {
  id: string
}

export interface ListTransactionsByUserInput {
  userId: string
  limit?: number
  offset?: number
}
