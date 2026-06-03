import { z } from 'zod'
import { eventEnvelopeSchema } from '../envelope.js'

// ---------------------------------------------------------------------------
// user.created — published by auth-service after a successful signup.
// Other services (account, wallet, notification) react to this event to
// provision their own state. The userId is used as the Kafka partition key
// so that all events for a given user are ordered.
// ---------------------------------------------------------------------------
export const userCreatedPayloadSchema = z.object({
  userId: z.string().uuid(),
  email: z.string().email(),
  createdAt: z.string().datetime(),
})

export const userCreatedSchema = eventEnvelopeSchema.extend({
  type: z.literal('user.created'),
  payload: userCreatedPayloadSchema,
})

export type UserCreatedEvent = z.infer<typeof userCreatedSchema>

// ---------------------------------------------------------------------------
// user.deleted — emitted when a user account is removed.
// Triggers downstream cleanup (wallets archived, notifications stopped, etc.).
// ---------------------------------------------------------------------------
export const userDeletedPayloadSchema = z.object({
  userId: z.string().uuid(),
  deletedAt: z.string().datetime(),
})

export const userDeletedSchema = eventEnvelopeSchema.extend({
  type: z.literal('user.deleted'),
  payload: userDeletedPayloadSchema,
})

export type UserDeletedEvent = z.infer<typeof userDeletedSchema>

// Discriminated union of all user-topic events. Useful for exhaustive
// switch statements in consumers.
export const userEventSchema = z.discriminatedUnion('type', [userCreatedSchema, userDeletedSchema])

export type UserEvent = z.infer<typeof userEventSchema>
