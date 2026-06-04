import type { Money } from './money.js'

export type TransactionType = 'charge' | 'refund'
export type TransactionStatus = 'completed' | 'declined'

export interface TransactionProps {
  id: string
  type: TransactionType
  clientRequestId: string
  originalTransactionId: string | null
  merchantId: string
  fromWalletId: string
  toWalletId: string
  amount: Money
  status: TransactionStatus
  declineReason: string | null
  createdAt: Date
}

// Transaction entity — the business fact "merchant X performed
// charge/refund operation between two wallets".
//
// Lifecycle is intentionally one-shot: a transaction is either
// `completed` (debit + credit committed + ledger entries written) or
// `declined` (no ledger entries, just a row for audit + idempotency).
//
// Five factory methods:
//   - recordChargeCompleted / recordChargeDeclined
//   - recordRefundCompleted / recordRefundDeclined
//   - rehydrate (from a persisted row)
export class Transaction {
  private constructor(private readonly props: TransactionProps) {}

  static recordChargeCompleted(input: {
    id: string
    clientRequestId: string
    merchantId: string
    fromWalletId: string
    toWalletId: string
    amount: Money
  }): Transaction {
    return new Transaction({
      id: input.id,
      type: 'charge',
      clientRequestId: input.clientRequestId,
      originalTransactionId: null,
      merchantId: input.merchantId,
      fromWalletId: input.fromWalletId,
      toWalletId: input.toWalletId,
      amount: input.amount,
      status: 'completed',
      declineReason: null,
      createdAt: new Date(),
    })
  }

  static recordChargeDeclined(input: {
    id: string
    clientRequestId: string
    merchantId: string
    fromWalletId: string
    toWalletId: string
    amount: Money
    reason: string
  }): Transaction {
    return new Transaction({
      id: input.id,
      type: 'charge',
      clientRequestId: input.clientRequestId,
      originalTransactionId: null,
      merchantId: input.merchantId,
      fromWalletId: input.fromWalletId,
      toWalletId: input.toWalletId,
      amount: input.amount,
      status: 'declined',
      declineReason: input.reason,
      createdAt: new Date(),
    })
  }

  static recordRefundCompleted(input: {
    id: string
    clientRequestId: string
    originalTransactionId: string
    merchantId: string
    fromWalletId: string
    toWalletId: string
    amount: Money
  }): Transaction {
    return new Transaction({
      id: input.id,
      type: 'refund',
      clientRequestId: input.clientRequestId,
      originalTransactionId: input.originalTransactionId,
      merchantId: input.merchantId,
      fromWalletId: input.fromWalletId,
      toWalletId: input.toWalletId,
      amount: input.amount,
      status: 'completed',
      declineReason: null,
      createdAt: new Date(),
    })
  }

  static recordRefundDeclined(input: {
    id: string
    clientRequestId: string
    originalTransactionId: string | null
    merchantId: string
    fromWalletId: string
    toWalletId: string
    amount: Money
    reason: string
  }): Transaction {
    return new Transaction({
      id: input.id,
      type: 'refund',
      clientRequestId: input.clientRequestId,
      originalTransactionId: input.originalTransactionId,
      merchantId: input.merchantId,
      fromWalletId: input.fromWalletId,
      toWalletId: input.toWalletId,
      amount: input.amount,
      status: 'declined',
      declineReason: input.reason,
      createdAt: new Date(),
    })
  }

  static rehydrate(props: TransactionProps): Transaction {
    return new Transaction(props)
  }

  get id(): string {
    return this.props.id
  }
  get type(): TransactionType {
    return this.props.type
  }
  get clientRequestId(): string {
    return this.props.clientRequestId
  }
  get originalTransactionId(): string | null {
    return this.props.originalTransactionId
  }
  get merchantId(): string {
    return this.props.merchantId
  }
  get fromWalletId(): string {
    return this.props.fromWalletId
  }
  get toWalletId(): string {
    return this.props.toWalletId
  }
  get amount(): Money {
    return this.props.amount
  }
  get status(): TransactionStatus {
    return this.props.status
  }
  get declineReason(): string | null {
    return this.props.declineReason
  }
  get createdAt(): Date {
    return this.props.createdAt
  }

  isCompleted(): boolean {
    return this.props.status === 'completed'
  }
  isCharge(): boolean {
    return this.props.type === 'charge'
  }
  isRefund(): boolean {
    return this.props.type === 'refund'
  }

  toSnapshot(): {
    id: string
    type: TransactionType
    clientRequestId: string
    originalTransactionId: string | null
    merchantId: string
    fromWalletId: string
    toWalletId: string
    amount: bigint
    currency: string
    status: TransactionStatus
    declineReason: string | null
    createdAt: Date
  } {
    return {
      id: this.props.id,
      type: this.props.type,
      clientRequestId: this.props.clientRequestId,
      originalTransactionId: this.props.originalTransactionId,
      merchantId: this.props.merchantId,
      fromWalletId: this.props.fromWalletId,
      toWalletId: this.props.toWalletId,
      amount: this.props.amount.amount,
      currency: this.props.amount.currency,
      status: this.props.status,
      declineReason: this.props.declineReason,
      createdAt: this.props.createdAt,
    }
  }
}
