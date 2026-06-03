import { z } from 'zod'
import { eventEnvelopeSchema } from '../envelope.js'

// ---------------------------------------------------------------------------
// account.created — emitted by account-service after a profile row is
// successfully created in reaction to a `user.created` event. Downstream
// services (notification, analytics) react to this event rather than to
// `user.created` directly so they only act AFTER the account is ready.
// ---------------------------------------------------------------------------
export const accountCreatedPayloadSchema = z.object({
  accountId: z.string().uuid(),
  userId: z.string().uuid(),
  email: z.string().email(),
  kycStatus: z.enum(['pending', 'verified', 'rejected']),
  createdAt: z.string().datetime(),
})

export const accountCreatedSchema = eventEnvelopeSchema.extend({
  type: z.literal('account.created'),
  payload: accountCreatedPayloadSchema,
})

export type AccountCreatedEvent = z.infer<typeof accountCreatedSchema>

// Union of all events that may appear on the `walletdigital.account` topic.
export const accountEventSchema = z.discriminatedUnion('type', [accountCreatedSchema])
export type AccountEvent = z.infer<typeof accountEventSchema>
