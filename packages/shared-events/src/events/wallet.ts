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
// in reaction to a `merchant.created` event.
//
// One wallet per merchant (mono-currency USD for this milestone), so the
// only owner reference we need is `merchantId`. The merchant's `type`
// (employee/company) lives in merchant-service and is NOT duplicated here.
//
// `balance` is carried as a non-negative integer string in MINOR UNITS
// (cents for USD) so JSON can safely transport bigint values without
// floating-point loss. The DB column is Decimal(20, 4); the wire format
// stays canonical (minor units) across the system.
// ---------------------------------------------------------------------------
export const walletCreatedPayloadSchema = z.object({
  walletId: z.string().uuid(),
  merchantId: z.string().uuid(),
  currency: currencyCodeSchema,
  balance: z.string().regex(/^\d+$/, 'balance must be a non-negative integer string'),
  createdAt: z.string().datetime(),
})

export const walletCreatedSchema = eventEnvelopeSchema.extend({
  type: z.literal('wallet.created'),
  payload: walletCreatedPayloadSchema,
})

export type WalletCreatedEvent = z.infer<typeof walletCreatedSchema>

// ---------------------------------------------------------------------------
// wallet.status_changed — emitted when an admin toggles a wallet between
// 'active' and 'inactive'. transaction-service consumes this to update
// its local projection and block charges/refunds against inactive wallets.
// ---------------------------------------------------------------------------
export const walletStatusChangedPayloadSchema = z.object({
  walletId: z.string().uuid(),
  status: z.enum(['active', 'inactive']),
  changedAt: z.string().datetime(),
})

export const walletStatusChangedSchema = eventEnvelopeSchema.extend({
  type: z.literal('wallet.status_changed'),
  payload: walletStatusChangedPayloadSchema,
})

export type WalletStatusChangedEvent = z.infer<typeof walletStatusChangedSchema>

// Union of all events on `walletdigital.wallet`. Discriminated by `type`.
export const walletEventSchema = z.discriminatedUnion('type', [walletCreatedSchema, walletStatusChangedSchema])
export type WalletEvent = z.infer<typeof walletEventSchema>
