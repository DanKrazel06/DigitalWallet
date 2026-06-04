import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import type { MerchantService } from '../../application/merchant.service.js'
import type { CreateMerchantUseCase } from '../../application/create-merchant.use-case.js'
import type { UpdateMerchantStatusUseCase } from '../../application/update-merchant-status.use-case.js'

// Routes wiring for merchant-service.
// At this milestone authentication is intentionally out of scope; anyone
// with network access can hit these endpoints.
export interface RoutesDeps {
  merchantService: MerchantService
  createMerchantUseCase: CreateMerchantUseCase
  updateMerchantStatusUseCase: UpdateMerchantStatusUseCase
}

const merchantIdParamSchema = z.object({ id: z.string().uuid() })

const createMerchantBodySchema = z.object({
  name: z.string().trim().min(1).max(200),
  type: z.enum(['employee', 'company']),
})

const updateStatusBodySchema = z.object({
  status: z.enum(['active', 'inactive']),
})

export async function registerRoutes(app: FastifyInstance, deps: RoutesDeps): Promise<void> {
  const typed = app.withTypeProvider<ZodTypeProvider>()

  // -------------------------------------------------------------------------
  // POST /merchants — create a new merchant identity.
  // 201 with { merchantId, name, createdAt }. Publishes merchant.created
  // which triggers wallet-service to auto-provision the merchant's wallet.
  // -------------------------------------------------------------------------
  typed.post('/merchants', { schema: { body: createMerchantBodySchema } }, async (request, reply) => {
    const result = await deps.createMerchantUseCase.execute(request.body)
    void reply.status(201).send(result)
  })

  // -------------------------------------------------------------------------
  // PATCH /merchants/:id/status — toggle active/inactive. Publishes
  // merchant.status_changed so downstream services refresh their view.
  // 204 No Content on success.
  // -------------------------------------------------------------------------
  typed.patch(
    '/merchants/:id/status',
    {
      schema: {
        params: merchantIdParamSchema,
        body: updateStatusBodySchema,
      },
    },
    async (request, reply) => {
      await deps.updateMerchantStatusUseCase.execute({
        id: request.params.id,
        status: request.body.status,
      })
      void reply.status(204).send()
    },
  )

  // -------------------------------------------------------------------------
  // GET /merchants/:id — fetch a merchant by id.
  // 200 OK with the merchant; 404 if no row matches.
  // -------------------------------------------------------------------------
  typed.get('/merchants/:id', { schema: { params: merchantIdParamSchema } }, async (request) => {
    return deps.merchantService.getById({ id: request.params.id })
  })
}
