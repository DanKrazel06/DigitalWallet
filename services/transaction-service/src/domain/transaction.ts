import type { Money } from './money.js'

// Lifecycle of a Transaction is intentionally short: a transaction is
// either accepted (completed) or rejected (failed) on first attempt — no
// "pending" state. This matches the rest of the architecture: the use-case
// either runs the full SQL transaction successfully, or persists a
// `failed` row with the reason and stops.
export type TransactionStatus = 'completed' | 'failed'

export interface TransactionProps {
  id: string
  idempotencyKey: string
  fromWalletId: string
  toWalletId: string
  fromUserId: string
  toUserId: string
  amount: Money
  status: TransactionStatus
  failureReason: string | null
  createdAt: Date
}

// Transaction entity — the business fact "X tried to transfer Y to Z".
//
// Two factory methods:
//   - recordCompleted(): produced after a successful debit+credit
//   - recordFailed(reason): produced when a validation rule rejects the
//     transfer (insufficient funds, frozen wallet, ...). We persist these
//     too so the idempotency key cannot be reused and so the failure is
//     auditable.
export class Transaction {
  private constructor(private readonly props: TransactionProps) {}

  static recordCompleted(input: {
    id: string
    idempotencyKey: string
    fromWalletId: string
    toWalletId: string
    fromUserId: string
    toUserId: string
    amount: Money
  }): Transaction {
    return new Transaction({
      ...input,
      status: 'completed',
      failureReason: null,
      createdAt: new Date(),
    })
  }

  static recordFailed(input: {
    id: string
    idempotencyKey: string
    fromWalletId: string
    toWalletId: string
    fromUserId: string
    toUserId: string
    amount: Money
    reason: string
  }): Transaction {
    return new Transaction({
      id: input.id,
      idempotencyKey: input.idempotencyKey,
      fromWalletId: input.fromWalletId,
      toWalletId: input.toWalletId,
      fromUserId: input.fromUserId,
      toUserId: input.toUserId,
      amount: input.amount,
      status: 'failed',
      failureReason: input.reason,
      createdAt: new Date(),
    })
  }

  static rehydrate(props: TransactionProps): Transaction {
    return new Transaction(props)
  }

  get id(): string {
    return this.props.id
  }
  get idempotencyKey(): string {
    return this.props.idempotencyKey
  }
  get fromWalletId(): string {
    return this.props.fromWalletId
  }
  get toWalletId(): string {
    return this.props.toWalletId
  }
  get fromUserId(): string {
    return this.props.fromUserId
  }
  get toUserId(): string {
    return this.props.toUserId
  }
  get amount(): Money {
    return this.props.amount
  }
  get status(): TransactionStatus {
    return this.props.status
  }
  get failureReason(): string | null {
    return this.props.failureReason
  }
  get createdAt(): Date {
    return this.props.createdAt
  }

  isCompleted(): boolean {
    return this.props.status === 'completed'
  }

  toSnapshot(): {
    id: string
    idempotencyKey: string
    fromWalletId: string
    toWalletId: string
    fromUserId: string
    toUserId: string
    amount: bigint
    currency: string
    status: TransactionStatus
    failureReason: string | null
    createdAt: Date
  } {
    return {
      id: this.props.id,
      idempotencyKey: this.props.idempotencyKey,
      fromWalletId: this.props.fromWalletId,
      toWalletId: this.props.toWalletId,
      fromUserId: this.props.fromUserId,
      toUserId: this.props.toUserId,
      amount: this.props.amount.amount,
      currency: this.props.amount.currency,
      status: this.props.status,
      failureReason: this.props.failureReason,
      createdAt: this.props.createdAt,
    }
  }
}
