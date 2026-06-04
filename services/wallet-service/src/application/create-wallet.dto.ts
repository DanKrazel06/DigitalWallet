import type { Currency } from '../domain/money.js'

// Input coming from a `merchant.created` Kafka event consumed off the
// `walletdigital.merchant` topic. The use-case ignores the merchant.type
// (employee/company) — the wallet just attaches to the merchant id.
export interface CreateWalletForMerchantInput {
  merchantId: string
  currency: Currency
}

export interface CreateWalletForMerchantOutput {
  walletId: string
  merchantId: string
  currency: Currency
  balance: string
  createdAt: string
}
