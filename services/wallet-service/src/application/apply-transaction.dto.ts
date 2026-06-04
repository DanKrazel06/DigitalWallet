import type { Currency } from '../domain/money.js'

// Input projected from a charge.completed or refund.completed event.
// transaction-service is the source of truth for charge/refund movements;
// wallet-service mirrors the resulting balance changes locally so its
// `GET /wallets` endpoints stay consistent.
export interface ApplyTransactionInput {
  fromWalletId: string
  toWalletId: string
  amount: string // minor units (cents) as carried on the wire
  currency: Currency
}
