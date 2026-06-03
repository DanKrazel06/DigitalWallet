import { z } from 'zod'
import { SUPPORTED_CURRENCIES } from '@walletdigital/money'
import { eventEnvelopeSchema } from '../envelope.js'

// Currency schema derived from the centralised SUPPORTED_CURRENCIES tuple
// in @walletdigital/money. Adding a new currency in one place propagates
// it to every service and every event schema.
export const currencyCodeSchema = z.enum(SUPPORTED_CURRENCIES)
export type CurrencyCode = z.infer<typeof currencyCodeSchema>

// ---------------------------------------------------------------------------
// wallet.created — emitted by wallet-service after a wallet is provisioned
// in reaction to an `account.created` event.
//
// `balance` is the wallet balance in MINOR UNITS of the currency (cents
// for EUR/USD/GBP), carried as a string so JSON can safely transport
// bigint values without floating-point loss. Never use floats for money.
// ---------------------------------------------------------------------------
export const walletCreatedPayloadSchema = z.object({
  walletId: z.string().uuid(),
  userId: z.string().uuid(),
  accountId: z.string().uuid(),
  currency: currencyCodeSchema,
  balance: z.string().regex(/^\d+$/, 'balance must be a non-negative integer string'),
  createdAt: z.string().datetime(),
})

export const walletCreatedSchema = eventEnvelopeSchema.extend({
  type: z.literal('wallet.created'),
  payload: walletCreatedPayloadSchema,
})

export type WalletCreatedEvent = z.infer<typeof walletCreatedSchema>

// Union of all events on `walletdigital.wallet`. Easy to extend with
// `wallet.frozen`, `wallet.closed`, etc. later — just add to the array.
export const walletEventSchema = z.discriminatedUnion('type', [walletCreatedSchema])
export type WalletEvent = z.infer<typeof walletEventSchema>
