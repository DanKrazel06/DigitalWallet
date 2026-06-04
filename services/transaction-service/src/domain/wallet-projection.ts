import type { Money } from './money.js'

export type WalletStatus = 'active' | 'inactive'

export interface WalletProjectionProps {
  id: string
  merchantId: string
  balance: Money
  status: WalletStatus
  updatedAt: Date
}

// WalletProjection — local read/write view of a wallet, mirrored from
// wallet-service via the `wallet.created` event and mutated locally on
// every completed charge / refund.
//
// Distinct from wallet-service's Wallet entity: this projection is
// owned by transaction-service and is the source of truth for balances
// DURING a charge or refund. wallet-service eventually syncs its own
// copy via the `charge.completed` / `refund.completed` events we publish
// after each operation.
export class WalletProjection {
  private constructor(private readonly props: WalletProjectionProps) {}

  // Initial creation from a `wallet.created` event consumed off Kafka.
  // The id matches wallet-service's row id so we can map both views.
  static fromCreatedEvent(input: { id: string; merchantId: string; balance: Money }): WalletProjection {
    return new WalletProjection({
      id: input.id,
      merchantId: input.merchantId,
      balance: input.balance,
      status: 'active',
      updatedAt: new Date(),
    })
  }

  static rehydrate(props: WalletProjectionProps): WalletProjection {
    return new WalletProjection(props)
  }

  // Apply a debit. Throws if it would yield a negative balance — callers
  // should pre-check and raise InsufficientFundsError instead.
  applyDebit(amount: Money): WalletProjection {
    const next = this.props.balance.subtract(amount)
    if (next.isNegative()) {
      throw new Error('debit would yield negative balance')
    }
    return new WalletProjection({
      ...this.props,
      balance: next,
      updatedAt: new Date(),
    })
  }

  applyCredit(amount: Money): WalletProjection {
    return new WalletProjection({
      ...this.props,
      balance: this.props.balance.add(amount),
      updatedAt: new Date(),
    })
  }

  withStatus(status: WalletStatus): WalletProjection {
    return new WalletProjection({
      ...this.props,
      status,
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
  get status(): WalletStatus {
    return this.props.status
  }
  get updatedAt(): Date {
    return this.props.updatedAt
  }

  isActive(): boolean {
    return this.props.status === 'active'
  }

  toSnapshot(): {
    id: string
    merchantId: string
    balance: bigint
    currency: string
    status: WalletStatus
    updatedAt: Date
  } {
    return {
      id: this.props.id,
      merchantId: this.props.merchantId,
      balance: this.props.balance.amount,
      currency: this.props.balance.currency,
      status: this.props.status,
      updatedAt: this.props.updatedAt,
    }
  }
}
