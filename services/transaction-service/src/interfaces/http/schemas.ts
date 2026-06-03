import { z } from 'zod'
import { SUPPORTED_CURRENCIES } from '@walletdigital/money'

// Body schema for POST /transactions.
//
// Amount carried as a string of digits-only minor units (cents) to avoid
// any floating-point round-trip on the wire. Validation here is permissive
// (positive integer); deeper business rules (sufficient funds, etc.) live
// in the use-case.
export const createTransferBodySchema = z.object({
  fromUserId: z.string().uuid(),
  toUserId: z.string().uuid(),
  amount: z.string().regex(/^[1-9]\d*$/, 'amount must be a positive integer string'),
  currency: z.enum(SUPPORTED_CURRENCIES),
})

export type CreateTransferBody = z.infer<typeof createTransferBodySchema>

// Idempotency-Key must be present on every POST /transactions call.
// Clients are expected to generate a fresh UUID per intended operation
// and retry with the SAME key on transient failures.
export const idempotencyHeaderSchema = z.object({
  'idempotency-key': z.string().uuid(),
})

export const userIdParamSchema = z.object({ userId: z.string().uuid() })
export const idParamSchema = z.object({ id: z.string().uuid() })
