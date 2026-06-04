import type { Currency } from '../domain/money.js'
import type { TransactionStatus } from '../domain/transaction.js'

export interface CreateRefundInput {
  clientRequestId: string
  merchantId: string
  // The id of the original charge being refunded.
  originalTransactionId: string
  // Refund amount in MINOR UNITS (cents). Optional: when absent, full
  // refund equal to the original charge amount.
  amount?: string
  currency: Currency
}

export interface CreateRefundOutput {
  transactionId: string
  originalTransactionId: string
  status: TransactionStatus
  declineReason: string | null
  replayed: boolean
}
