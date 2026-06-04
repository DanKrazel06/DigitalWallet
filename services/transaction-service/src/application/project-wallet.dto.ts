import type { Currency } from '../domain/money.js'
import type { WalletStatus } from '../domain/wallet-projection.js'

// Input projected from a `wallet.created` Kafka event.
export interface ProjectWalletFromCreatedInput {
  walletId: string
  merchantId: string
  currency: Currency
  balance: string // minor units, as carried on the wire
}

// Input projected from a `wallet.status_changed` Kafka event.
export interface ProjectWalletStatusInput {
  walletId: string
  status: WalletStatus
}
