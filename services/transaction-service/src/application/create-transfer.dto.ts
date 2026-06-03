import type { Currency } from '../domain/money.js'
import type { TransactionStatus } from '../domain/transaction.js'

export interface CreateTransferInput {
  idempotencyKey: string
  fromUserId: string
  toUserId: string
  amount: string // string of minor units (cents). Validated to be digits-only at HTTP boundary.
  currency: Currency
}

export interface CreateTransferOutput {
  transactionId: string
  status: TransactionStatus
  failureReason: string | null
  // Indicates whether this call actually performed the work or whether
  // it returned a previously-stored result (idempotent replay).
  replayed: boolean
}
