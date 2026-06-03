import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import type { CreateTransferUseCase } from '../../application/create-transfer.use-case.js'
import type { TransactionService } from '../../application/transaction.service.js'
import {
  createTransferBodySchema,
  idParamSchema,
  idempotencyHeaderSchema,
  userIdParamSchema,
} from './schemas.js'

export interface RoutesDeps {
  createTransferUseCase: CreateTransferUseCase
  transactionService: TransactionService
}

const listQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(200).optional(),
  offset: z.coerce.number().int().nonnegative().optional(),
})

export async function registerRoutes(app: FastifyInstance, deps: RoutesDeps): Promise<void> {
  const typed = app.withTypeProvider<ZodTypeProvider>()

  // -------------------------------------------------------------------------
  // POST /transactions — submit a new transfer.
  //
  // Required header: `Idempotency-Key: <uuid>`. The same key with the
  // same body re-runs as a no-op replay. The same key with a different
  // body yields 409 (not implemented yet — current behaviour: returns
  // the previously-stored outcome, ignoring the new body).
  //
  // Returns:
  //   201 — newly executed transfer (status=completed)
  //   200 — replay of a prior call (replayed=true in body)
  //   422 — business rejection (the failure is persisted; client can
  //         inspect failureReason)
  //   404 — wallet not projected yet (user has no wallet here)
  // -------------------------------------------------------------------------
  typed.post(
    '/transactions',
    {
      schema: {
        body: createTransferBodySchema,
        headers: idempotencyHeaderSchema,
      },
    },
    async (request, reply) => {
      // Headers are validated by Zod via the route schema. We cast here
      // because Fastify's default header typing is permissive
      // (string | string[] | undefined).
      const headers = request.headers as unknown as { 'idempotency-key': string }
      const result = await deps.createTransferUseCase.execute({
        idempotencyKey: headers['idempotency-key'],
        fromUserId: request.body.fromUserId,
        toUserId: request.body.toUserId,
        amount: request.body.amount,
        currency: request.body.currency,
      })
      const status =
        result.replayed ? 200 : result.status === 'completed' ? 201 : 422
      void reply.status(status).send(result)
    },
  )

  // GET /transactions/:id — single transaction lookup.
  typed.get(
    '/transactions/:id',
    { schema: { params: idParamSchema } },
    async (request) => {
      return deps.transactionService.getById({ id: request.params.id })
    },
  )

  // GET /transactions/by-user/:userId — paginated history (both directions).
  typed.get(
    '/transactions/by-user/:userId',
    { schema: { params: userIdParamSchema, querystring: listQuerySchema } },
    async (request) => {
      return deps.transactionService.listByUserId({
        userId: request.params.userId,
        limit: request.query.limit,
        offset: request.query.offset,
      })
    },
  )
}
