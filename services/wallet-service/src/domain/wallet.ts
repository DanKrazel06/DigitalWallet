import { Money, type Currency } from './money.js'

export type WalletStatus = 'active' | 'frozen' | 'closed'

export interface WalletProps {
  id: string
  userId: string
  accountId: string
  balance: Money
  status: WalletStatus
  createdAt: Date
  updatedAt: Date
}

// Wallet entity — money container for one (userId, currency) pair.
// Construction goes through factories so the rest of the codebase cannot
// build an invalid wallet (e.g. with a balance in the wrong currency or
// a status outside the allowed set).
export class Wallet {
  private constructor(private readonly props: WalletProps) {}

  // Factory used by CreateWalletFromAccountUseCase. New wallets always
  // start with a zero balance and an "active" status; the currency is
  // chosen by the caller (defaults to EUR via service config).
  static createFromAccount(input: {
    id: string
    userId: string
    accountId: string
    currency: Currency
  }): Wallet {
    const now = new Date()
    return new Wallet({
      id: input.id,
      userId: input.userId,
      accountId: input.accountId,
      balance: Money.zero(input.currency),
      status: 'active',
      createdAt: now,
      updatedAt: now,
    })
  }

  // Rebuild a Wallet from a persisted row. No validation — trust the DB.
  static rehydrate(props: WalletProps): Wallet {
    return new Wallet(props)
  }

  get id(): string {
    return this.props.id
  }
  get userId(): string {
    return this.props.userId
  }
  get accountId(): string {
    return this.props.accountId
  }
  get balance(): Money {
    return this.props.balance
  }
  get currency(): Currency {
    return this.props.balance.currency
  }
  get status(): WalletStatus {
    return this.props.status
  }
  get createdAt(): Date {
    return this.props.createdAt
  }
  get updatedAt(): Date {
    return this.props.updatedAt
  }

  // Flat snapshot for the repository to map back to a DB row.
  toSnapshot(): {
    id: string
    userId: string
    accountId: string
    balance: bigint
    currency: Currency
    status: WalletStatus
    createdAt: Date
    updatedAt: Date
  } {
    return {
      id: this.props.id,
      userId: this.props.userId,
      accountId: this.props.accountId,
      balance: this.props.balance.amount,
      currency: this.props.balance.currency,
      status: this.props.status,
      createdAt: this.props.createdAt,
      updatedAt: this.props.updatedAt,
    }
  }
}
