import type { Currency } from '../domain/money.js'
import type { TransactionStatus } from '../domain/transaction.js'

export interface CreateChargeInput {
  clientRequestId: string
  merchantId: string
  fromWalletId: string
  toWalletId: string
  amount: string // string of minor units (cents). Validated at HTTP boundary.
  currency: Currency
}

export interface CreateChargeOutput {
  transactionId: string
  status: TransactionStatus
  declineReason: string | null
  // Indicates whether this call actually performed the work or whether
  // it returned a previously-stored result (idempotent replay).
  replayed: boolean
}
