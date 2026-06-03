import type { Currency } from '../domain/money.js'
import type { WalletStatus } from '../domain/wallet.js'

// Public shape of a wallet returned by the read-side endpoints.
// `balance` is a string of minor units (cents) to safely transport bigint
// across JSON. Clients are expected to format it for display.
export interface WalletDto {
  id: string
  userId: string
  accountId: string
  currency: Currency
  balance: string
  status: WalletStatus
  createdAt: string
  updatedAt: string
}

export interface GetWalletsByUserIdInput {
  userId: string
}

export interface GetWalletByIdInput {
  id: string
}
