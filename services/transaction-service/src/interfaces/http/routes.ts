import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import type { TransactionService } from '../../application/transaction.service.js'
import type { CreateChargeUseCase } from '../../application/create-charge.use-case.js'
import type { CreateRefundUseCase } from '../../application/create-refund.use-case.js'
import type { LedgerService } from '../../application/ledger.service.js'

export interface RoutesDeps {
  transactionService: TransactionService
  ledgerService: LedgerService
  createChargeUseCase: CreateChargeUseCase
  createRefundUseCase: CreateRefundUseCase
}

const transactionIdParamSchema = z.object({ id: z.string().uuid() })
const merchantIdParamSchema = z.object({ merchantId: z.string().uuid() })
const walletIdParamSchema = z.object({ id: z.string().uuid() })

const idempotencyKeyHeaderSchema = z.object({
  'idempotency-key': z.string().uuid(),
})

const chargeBodySchema = z.object({
  merchantId: z.string().uuid(),
  fromWalletId: z.string().uuid(),
  toWalletId: z.string().uuid(),
  amount: z.string().regex(/^\d+$/, 'amount must be a non-negative integer string'),
  currency: z.enum(['USD']),
})

const refundBodySchema = z.object({
  merchantId: z.string().uuid(),
  originalTransactionId: z.string().uuid(),
  amount: z.string().regex(/^\d+$/).optional(),
  currency: z.enum(['USD']),
})

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
})

export async function registerRoutes(app: FastifyInstance, deps: RoutesDeps): Promise<void> {
  const typed = app.withTypeProvider<ZodTypeProvider>()

  // -------------------------------------------------------------------------
  // POST /charges — debit source wallet, credit destination wallet.
  // Idempotency-Key header is REQUIRED. Replays return the original
  // outcome (200 instead of 201).
  // -------------------------------------------------------------------------
  typed.post(
    '/charges',
    { schema: { body: chargeBodySchema, headers: idempotencyKeyHeaderSchema } },
    async (request, reply) => {
      const result = await deps.createChargeUseCase.execute({
        clientRequestId: request.headers['idempotency-key'] as string,
        merchantId: request.body.merchantId,
        fromWalletId: request.body.fromWalletId,
        toWalletId: request.body.toWalletId,
        amount: request.body.amount,
        currency: request.body.currency,
      })
      void reply.status(result.replayed ? 200 : 201).send(result)
    },
  )

  // -------------------------------------------------------------------------
  // POST /refunds — reverse a previous charge. Idempotency-Key required.
  // -------------------------------------------------------------------------
  typed.post(
    '/refunds',
    { schema: { body: refundBodySchema, headers: idempotencyKeyHeaderSchema } },
    async (request, reply) => {
      const result = await deps.createRefundUseCase.execute({
        clientRequestId: request.headers['idempotency-key'] as string,
        merchantId: request.body.merchantId,
        originalTransactionId: request.body.originalTransactionId,
        amount: request.body.amount,
        currency: request.body.currency,
      })
      void reply.status(result.replayed ? 200 : 201).send(result)
    },
  )

  // -------------------------------------------------------------------------
  // GET /transactions/:id — fetch a single transaction or 404.
  // -------------------------------------------------------------------------
  typed.get('/transactions/:id', { schema: { params: transactionIdParamSchema } }, async (request) => {
    return deps.transactionService.getById({ id: request.params.id })
  })

  // -------------------------------------------------------------------------
  // GET /transactions/by-merchant/:merchantId — paginated history for a
  // merchant. Query params: ?limit=50&offset=0 (defaults applied).
  // -------------------------------------------------------------------------
  typed.get(
    '/transactions/by-merchant/:merchantId',
    {
      schema: {
        params: merchantIdParamSchema,
        querystring: listQuerySchema,
      },
    },
    async (request) => {
      return deps.transactionService.listByMerchantId({
        merchantId: request.params.merchantId,
        limit: request.query.limit,
        offset: request.query.offset,
      })
    },
  )

  // -------------------------------------------------------------------------
  // GET /wallets/:id/ledger-entries — chronological ledger movements
  // on a wallet (most recent first). Query: ?limit=50&offset=0.
  // 404 if the wallet does not exist in our projection.
  // -------------------------------------------------------------------------
  typed.get(
    '/wallets/:id/ledger-entries',
    {
      schema: {
        params: walletIdParamSchema,
        querystring: listQuerySchema,
      },
    },
    async (request) => {
      return deps.ledgerService.listByWalletId({
        walletId: request.params.id,
        limit: request.query.limit,
        offset: request.query.offset,
      })
    },
  )

  // -------------------------------------------------------------------------
  // GET /transactions/:id/ledger-entries — entries attached to a single
  // transaction (typically 2 for completed, 0 for declined).
  // 404 if the transaction does not exist.
  // -------------------------------------------------------------------------
  typed.get('/transactions/:id/ledger-entries', { schema: { params: transactionIdParamSchema } }, async (request) => {
    return deps.ledgerService.listByTransactionId({ transactionId: request.params.id })
  })
}
