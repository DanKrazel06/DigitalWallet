import { z } from 'zod'
import { eventEnvelopeSchema } from '../envelope.js'
import { currencyCodeSchema } from './wallet.js'

// Reuse the currency enum from wallet events — same domain concept,
// avoids drift between the two event families.

// Monetary amount on the wire: string of digits (cents). bigint cannot be
// JSON-serialised so we use a regex-validated string. Sign is optional
// because transaction amounts are always positive (direction is given by
// from/to wallets).
const minorAmountSchema = z.string().regex(/^\d+$/, 'amount must be a non-negative integer string')

// ---------------------------------------------------------------------------
// transaction.completed — emitted by transaction-service after the DB
// transaction that moved funds has committed. wallet-service consumes this
// event to refresh its own "displayed balance" view of each wallet.
// ---------------------------------------------------------------------------
export const transactionCompletedPayloadSchema = z.object({
  transactionId: z.string().uuid(),
  idempotencyKey: z.string().uuid(),
  fromUserId: z.string().uuid(),
  toUserId: z.string().uuid(),
  fromWalletId: z.string().uuid(),
  toWalletId: z.string().uuid(),
  amount: minorAmountSchema,
  currency: currencyCodeSchema,
  createdAt: z.string().datetime(),
})

export const transactionCompletedSchema = eventEnvelopeSchema.extend({
  type: z.literal('transaction.completed'),
  payload: transactionCompletedPayloadSchema,
})

export type TransactionCompletedEvent = z.infer<typeof transactionCompletedSchema>

// ---------------------------------------------------------------------------
// transaction.failed — emitted when a transfer request is rejected for a
// business reason (insufficient funds, frozen wallet, etc.). We still
// persist the failed transaction row for audit / idempotency reasons.
// ---------------------------------------------------------------------------
export const transactionFailedPayloadSchema = z.object({
  transactionId: z.string().uuid(),
  idempotencyKey: z.string().uuid(),
  fromUserId: z.string().uuid(),
  toUserId: z.string().uuid(),
  amount: minorAmountSchema,
  currency: currencyCodeSchema,
  reason: z.string(),
  createdAt: z.string().datetime(),
})

export const transactionFailedSchema = eventEnvelopeSchema.extend({
  type: z.literal('transaction.failed'),
  payload: transactionFailedPayloadSchema,
})

export type TransactionFailedEvent = z.infer<typeof transactionFailedSchema>

// Union of all events on `walletdigital.transaction`.
export const transactionEventSchema = z.discriminatedUnion('type', [
  transactionCompletedSchema,
  transactionFailedSchema,
])
export type TransactionEvent = z.infer<typeof transactionEventSchema>
