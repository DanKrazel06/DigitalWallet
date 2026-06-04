import { Money, type Currency } from './money.js'

export type WalletStatus = 'active' | 'inactive'

export interface WalletProps {
  id: string
  merchantId: string
  balance: Money
  status: WalletStatus
  createdAt: Date
  updatedAt: Date
}

// Wallet entity — funds container belonging to a single merchant.
// Construction goes through factories so the rest of the codebase cannot
// build an invalid wallet.
export class Wallet {
  private constructor(private readonly props: WalletProps) {}

  // Factory used by CreateWalletFromMerchantUseCase. New wallets always
  // start with a zero balance and an "active" status; the currency is
  // chosen by the caller (defaults to USD via service config).
  static createForMerchant(input: { id: string; merchantId: string; currency: Currency }): Wallet {
    const now = new Date()
    return new Wallet({
      id: input.id,
      merchantId: input.merchantId,
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

  // Returns a NEW wallet entity with the requested status. Immutability
  // keeps the domain transparent — the repository decides when to persist.
  withStatus(status: WalletStatus): Wallet {
    return new Wallet({ ...this.props, status, updatedAt: new Date() })
  }

  // Returns a NEW wallet entity with the given balance applied. Used by
  // the transaction-event consumer (mirrors balance changes committed
  // by transaction-service back into wallet-service's view).
  withBalance(balance: Money): Wallet {
    return new Wallet({ ...this.props, balance, updatedAt: new Date() })
  }

  // Apply a debit to the balance. Used by the transaction-event consumer
  // to mirror balance changes committed by transaction-service. Returns
  // a new entity; the caller decides when to persist.
  applyDebit(amount: Money): Wallet {
    return new Wallet({
      ...this.props,
      balance: this.props.balance.subtract(amount),
      updatedAt: new Date(),
    })
  }

  // Apply a credit to the balance. Symmetric counterpart of applyDebit.
  applyCredit(amount: Money): Wallet {
    return new Wallet({
      ...this.props,
      balance: this.props.balance.add(amount),
      updatedAt: new Date(),
    })
  }

  get id(): string {
    return this.props.id
  }
  get merchantId(): string {
    return this.props.merchantId
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

  isActive(): boolean {
    return this.props.status === 'active'
  }

  // Flat snapshot for the repository to map back to a DB row.
  toSnapshot(): {
    id: string
    merchantId: string
    balance: bigint
    currency: Currency
    status: WalletStatus
    createdAt: Date
    updatedAt: Date
  } {
    return {
      id: this.props.id,
      merchantId: this.props.merchantId,
      balance: this.props.balance.amount,
      currency: this.props.balance.currency,
      status: this.props.status,
      createdAt: this.props.createdAt,
      updatedAt: this.props.updatedAt,
    }
  }
}
