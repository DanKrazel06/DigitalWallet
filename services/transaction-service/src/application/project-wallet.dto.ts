import type { Currency } from '../domain/money.js'

// Input projected from a `wallet.created` Kafka event. The userId here is
// the auth-service user; the walletId is wallet-service's own row id —
// we keep the same id locally so both views can be cross-referenced.
export interface ProjectWalletFromCreatedInput {
  walletId: string
  userId: string
  currency: Currency
  balance: string // minor units, as carried on the wire
}
