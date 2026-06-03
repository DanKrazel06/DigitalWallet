import type { Money } from './money.js'

// LedgerEntry — single immutable accounting movement on one wallet.
//
// Comes in two flavours, produced by the matching factories:
//   - debit(...)  — wallet's balance went DOWN
//   - credit(...) — wallet's balance went UP
//
// Each completed Transaction generates EXACTLY two ledger entries:
// one debit on the source wallet and one credit on the destination
// wallet. The pair has the same `transactionId`, so the auditor can
// always reconstruct what happened together.
//
// `balanceAfter` is the wallet's running balance AFTER this entry was
// applied. It lets us reconstruct any historical balance without
// replaying every entry from the beginning.
//
// IMMUTABLE: ledger entries are never updated or deleted. Mistakes are
// fixed by adding COMPENSATING entries (a debit followed later by a
// credit of the same amount, for instance). This is what makes the
// ledger auditable and compliant with financial regulations.
export interface LedgerEntryProps {
  id: string
  transactionId: string
  walletId: string
  debit: Money
  credit: Money
  balanceAfter: Money
  createdAt: Date
}

export class LedgerEntry {
  private constructor(private readonly props: LedgerEntryProps) {}

  // Factory for the "money went out of this wallet" half of a transfer.
  // `debit` is the amount removed; `credit` is forced to zero so the
  // direction is unambiguous.
  static debit(input: {
    id: string
    transactionId: string
    walletId: string
    amount: Money
    balanceAfter: Money
  }): LedgerEntry {
    return new LedgerEntry({
      id: input.id,
      transactionId: input.transactionId,
      walletId: input.walletId,
      debit: input.amount,
      credit: input.amount.subtract(input.amount), // zero in the same currency
      balanceAfter: input.balanceAfter,
      createdAt: new Date(),
    })
  }

  // Factory for the "money arrived in this wallet" half of a transfer.
  static credit(input: {
    id: string
    transactionId: string
    walletId: string
    amount: Money
    balanceAfter: Money
  }): LedgerEntry {
    return new LedgerEntry({
      id: input.id,
      transactionId: input.transactionId,
      walletId: input.walletId,
      debit: input.amount.subtract(input.amount), // zero in the same currency
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
    walletId: string
    debit: bigint
    credit: bigint
    balanceAfter: bigint
    createdAt: Date
  } {
    return {
      id: this.props.id,
      transactionId: this.props.transactionId,
      walletId: this.props.walletId,
      debit: this.props.debit.amount,
      credit: this.props.credit.amount,
      balanceAfter: this.props.balanceAfter.amount,
      createdAt: this.props.createdAt,
    }
  }
}
