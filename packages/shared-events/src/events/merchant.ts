import { z } from 'zod'
import { eventEnvelopeSchema } from '../envelope.js'

// Merchant lifecycle events published by merchant-service on the topic
// `walletdigital.merchant`. Consumed by wallet-service to auto-provision
// the merchant's own wallet, and by future analytics / notification
// services.

// ---------------------------------------------------------------------------
// merchant.created — emitted after a merchant has been successfully
// persisted. Triggers the auto-creation of a wallet owned by this
// merchant on the wallet-service side (owner_type='merchant',
// owner_id=merchantId, merchant_id=null because the merchant doesn't have
// a parent merchant managing them).
// ---------------------------------------------------------------------------
// Enum kept narrow on purpose; adding 'partner' or 'platform' later is
// a one-line change here that propagates to every consumer via Zod.
export const merchantTypeSchema = z.enum(['employee', 'company'])
export type MerchantTypeCode = z.infer<typeof merchantTypeSchema>

export const merchantCreatedPayloadSchema = z.object({
  merchantId: z.string().uuid(),
  name: z.string(),
  type: merchantTypeSchema,
  createdAt: z.string().datetime(),
})

export const merchantCreatedSchema = eventEnvelopeSchema.extend({
  type: z.literal('merchant.created'),
  payload: merchantCreatedPayloadSchema,
})

export type MerchantCreatedEvent = z.infer<typeof merchantCreatedSchema>

// ---------------------------------------------------------------------------
// merchant.status_changed — emitted when an admin toggles a merchant
// between 'active' and 'inactive'. transaction-service consumes this so
// it can decline new charges/refunds initiated by an inactive merchant.
// ---------------------------------------------------------------------------
export const merchantStatusChangedPayloadSchema = z.object({
  merchantId: z.string().uuid(),
  status: z.enum(['active', 'inactive']),
  changedAt: z.string().datetime(),
})

export const merchantStatusChangedSchema = eventEnvelopeSchema.extend({
  type: z.literal('merchant.status_changed'),
  payload: merchantStatusChangedPayloadSchema,
})

export type MerchantStatusChangedEvent = z.infer<typeof merchantStatusChangedSchema>

// Union of all events on `walletdigital.merchant`. Consumers use this
// as the discriminated union for their handler's switch statement.
export const merchantEventSchema = z.discriminatedUnion('type', [merchantCreatedSchema, merchantStatusChangedSchema])
export type MerchantEvent = z.infer<typeof merchantEventSchema>
