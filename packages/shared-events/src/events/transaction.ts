import { z } from 'zod'
import { eventEnvelopeSchema } from '../envelope.js'
import { currencyCodeSchema } from './wallet.js'

// Reuse the currency enum from wallet events — same domain concept,
// avoids drift between the two event families.

// Monetary amount on the wire: string of digits (cents). bigint cannot be
// JSON-serialised so we use a regex-validated non-negative integer string.
const minorAmountSchema = z.string().regex(/^\d+$/, 'amount must be a non-negative integer string')

// ===========================================================================
// CHARGE EVENTS — emitted by transaction-service for POST /charges flows.
// A charge debits an employee/company wallet and credits a merchant wallet.
// ===========================================================================

// ---------------------------------------------------------------------------
// charge.completed — emitted after a charge has been atomically applied
// in the local DB. wallet-service consumes this to refresh its own
// "displayed balance" view of each wallet involved.
// ---------------------------------------------------------------------------
export const chargeCompletedPayloadSchema = z.object({
  transactionId: z.string().uuid(),
  clientRequestId: z.string().uuid(),
  merchantId: z.string().uuid(),
  fromWalletId: z.string().uuid(),
  toWalletId: z.string().uuid(),
  amount: minorAmountSchema,
  currency: currencyCodeSchema,
  createdAt: z.string().datetime(),
})

export const chargeCompletedSchema = eventEnvelopeSchema.extend({
  type: z.literal('charge.completed'),
  payload: chargeCompletedPayloadSchema,
})

export type ChargeCompletedEvent = z.infer<typeof chargeCompletedSchema>

// ---------------------------------------------------------------------------
// charge.declined — emitted when a charge is rejected by a business rule
// (merchant inactive, wallet inactive, insufficient funds). We still
// persist a `declined` Transaction row for audit + idempotency reasons,
// but no ledger entries are written.
// ---------------------------------------------------------------------------
export const chargeDeclinedPayloadSchema = z.object({
  transactionId: z.string().uuid(),
  clientRequestId: z.string().uuid(),
  merchantId: z.string().uuid(),
  fromWalletId: z.string().uuid(),
  toWalletId: z.string().uuid(),
  amount: minorAmountSchema,
  currency: currencyCodeSchema,
  reason: z.string(),
  createdAt: z.string().datetime(),
})

export const chargeDeclinedSchema = eventEnvelopeSchema.extend({
  type: z.literal('charge.declined'),
  payload: chargeDeclinedPayloadSchema,
})

export type ChargeDeclinedEvent = z.infer<typeof chargeDeclinedSchema>

// ===========================================================================
// REFUND EVENTS — emitted by transaction-service for POST /refunds flows.
// A refund reverses a previous charge: debits the merchant wallet, credits
// the wallet that originally paid.
// ===========================================================================

// ---------------------------------------------------------------------------
// refund.completed — emitted after a refund has been atomically applied.
// Carries `originalTransactionId` so downstream consumers can correlate
// the refund with its parent charge.
// ---------------------------------------------------------------------------
export const refundCompletedPayloadSchema = z.object({
  transactionId: z.string().uuid(),
  clientRequestId: z.string().uuid(),
  originalTransactionId: z.string().uuid(),
  merchantId: z.string().uuid(),
  fromWalletId: z.string().uuid(),
  toWalletId: z.string().uuid(),
  amount: minorAmountSchema,
  currency: currencyCodeSchema,
  createdAt: z.string().datetime(),
})

export const refundCompletedSchema = eventEnvelopeSchema.extend({
  type: z.literal('refund.completed'),
  payload: refundCompletedPayloadSchema,
})

export type RefundCompletedEvent = z.infer<typeof refundCompletedSchema>

// ---------------------------------------------------------------------------
// refund.declined — emitted when a refund is rejected (charge not found,
// original transaction not a charge, refund exceeds the original amount,
// etc.). `originalTransactionId` is nullable because the rejection can
// happen before we even successfully load the original transaction.
// ---------------------------------------------------------------------------
export const refundDeclinedPayloadSchema = z.object({
  transactionId: z.string().uuid(),
  clientRequestId: z.string().uuid(),
  originalTransactionId: z.string().uuid().nullable(),
  merchantId: z.string().uuid(),
  amount: minorAmountSchema,
  currency: currencyCodeSchema,
  reason: z.string(),
  createdAt: z.string().datetime(),
})

export const refundDeclinedSchema = eventEnvelopeSchema.extend({
  type: z.literal('refund.declined'),
  payload: refundDeclinedPayloadSchema,
})

export type RefundDeclinedEvent = z.infer<typeof refundDeclinedSchema>

// ===========================================================================
// Union of every event on `walletdigital.transaction`. Consumers use this
// as a discriminated union so TS forces them to handle each variant.
// ===========================================================================
export const transactionEventSchema = z.discriminatedUnion('type', [
  chargeCompletedSchema,
  chargeDeclinedSchema,
  refundCompletedSchema,
  refundDeclinedSchema,
])
export type TransactionEvent = z.infer<typeof transactionEventSchema>
