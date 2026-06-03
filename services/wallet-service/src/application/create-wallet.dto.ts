import type { Currency } from '../domain/money.js'

export interface CreateWalletFromAccountInput {
  userId: string
  accountId: string
  currency: Currency
}

export interface CreateWalletFromAccountOutput {
  walletId: string
  userId: string
  accountId: string
  currency: Currency
  balance: string
  createdAt: string
}
