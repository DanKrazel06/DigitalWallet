import type { Money } from './money.js'
import type { TransactionType } from './transaction.js'

// LedgerEntry — single immutable accounting movement on one wallet.
//
// `type` mirrors the parent transaction (charge or refund). Reports can
// filter by movement kind without joining `transactions`.
//
// Each completed Transaction generates EXACTLY TWO ledger entries:
// one debit on the source wallet and one credit on the destination
// wallet, sharing the same `transactionId`.
//
// `balanceAfter` is the wallet's running balance AFTER this entry was
// applied. Lets us reconstruct historical balances without replaying
// every entry from the beginning.
//
// IMMUTABLE: ledger entries are never updated or deleted. Mistakes are
// fixed by adding COMPENSATING entries (debit followed by an offsetting
// credit at a later date). This is what makes the ledger auditable.
export interface LedgerEntryProps {
  id: string
  transactionId: string
  type: TransactionType
  walletId: string
  debit: Money
  credit: Money
  balanceAfter: Money
  createdAt: Date
}

export class LedgerEntry {
  private constructor(private readonly props: LedgerEntryProps) {}

  // Charge: source wallet debited.
  static chargeDebit(input: {
    id: string
    transactionId: string
    walletId: string
    amount: Money
    balanceAfter: Money
  }): LedgerEntry {
    return new LedgerEntry({
      id: input.id,
      transactionId: input.transactionId,
      type: 'charge',
      walletId: input.walletId,
      debit: input.amount,
      credit: input.amount.subtract(input.amount), // zero, same currency
      balanceAfter: input.balanceAfter,
      createdAt: new Date(),
    })
  }

  // Charge: destination (merchant) wallet credited.
  static chargeCredit(input: {
    id: string
    transactionId: string
    walletId: string
    amount: Money
    balanceAfter: Money
  }): LedgerEntry {
    return new LedgerEntry({
      id: input.id,
      transactionId: input.transactionId,
      type: 'charge',
      walletId: input.walletId,
      debit: input.amount.subtract(input.amount),
      credit: input.amount,
      balanceAfter: input.balanceAfter,
      createdAt: new Date(),
    })
  }

  // Refund: merchant wallet debited (the merchant gives the money back).
  static refundDebit(input: {
    id: string
    transactionId: string
    walletId: string
    amount: Money
    balanceAfter: Money
  }): LedgerEntry {
    return new LedgerEntry({
      id: input.id,
      transactionId: input.transactionId,
      type: 'refund',
      walletId: input.walletId,
      debit: input.amount,
      credit: input.amount.subtract(input.amount),
      balanceAfter: input.balanceAfter,
      createdAt: new Date(),
    })
  }

  // Refund: original payer wallet credited (gets the money back).
  static refundCredit(input: {
    id: string
    transactionId: string
    walletId: string
    amount: Money
    balanceAfter: Money
  }): LedgerEntry {
    return new LedgerEntry({
      id: input.id,
      transactionId: input.transactionId,
      type: 'refund',
      walletId: input.walletId,
      debit: input.amount.subtract(input.amount),
      credit: input.amount,
      balanceAfter: input.balanceAfter,
      createdAt: new Date(),
    })
  }

  // Rebuild from a persisted row.
  static rehydrate(props: LedgerEntryProps): LedgerEntry {
    return new LedgerEntry(props)
  }

  get id(): string {
    return this.props.id
  }
  get transactionId(): string {
    return this.props.transactionId
  }
  get type(): TransactionType {
    return this.props.type
  }
  get walletId(): string {
    return this.props.walletId
  }
  get debit(): Money {
    return this.props.debit
  }
  get credit(): Money {
    return this.props.credit
  }
  get balanceAfter(): Money {
    return this.props.balanceAfter
  }
  get createdAt(): Date {
    return this.props.createdAt
  }

  toSnapshot(): {
    id: string
    transactionId: string
    type: TransactionType
    walletId: string
    debit: bigint
    credit: bigint
    balanceAfter: bigint
    createdAt: Date
  } {
    return {
      id: this.props.id,
      transactionId: this.props.transactionId,
      type: this.props.type,
      walletId: this.props.walletId,
      debit: this.props.debit.amount,
      credit: this.props.credit.amount,
      balanceAfter: this.props.balanceAfter.amount,
      createdAt: this.props.createdAt,
    }
  }
}
