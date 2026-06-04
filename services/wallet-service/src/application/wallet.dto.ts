import type { Currency } from '../domain/money.js'
import type { WalletStatus } from '../domain/wallet.js'

// Public shape of a wallet returned by the read-side endpoints.
// `balance` is a string of minor units (cents) to safely transport bigint
// across JSON. Clients are expected to format it for display.
export interface WalletDto {
  id: string
  merchantId: string
  currency: Currency
  balance: string
  status: WalletStatus
  createdAt: string
  updatedAt: string
}

export interface GetWalletByMerchantInput {
  merchantId: string
}

export interface GetWalletByIdInput {
  id: string
}

export interface UpdateWalletStatusInput {
  id: string
  status: WalletStatus
}
