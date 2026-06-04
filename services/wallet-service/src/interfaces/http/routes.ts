import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import type { WalletService } from '../../application/wallet.service.js'
import type { UpdateWalletStatusUseCase } from '../../application/update-wallet-status.use-case.js'

export interface RoutesDeps {
  walletService: WalletService
  updateWalletStatusUseCase: UpdateWalletStatusUseCase
}

const merchantIdParamSchema = z.object({ merchantId: z.string().uuid() })
const walletIdParamSchema = z.object({ id: z.string().uuid() })
const updateStatusBodySchema = z.object({
  status: z.enum(['active', 'inactive']),
})

export async function registerRoutes(app: FastifyInstance, deps: RoutesDeps): Promise<void> {
  const typed = app.withTypeProvider<ZodTypeProvider>()

  // -------------------------------------------------------------------------
  // GET /wallets/by-merchant/:merchantId — the wallet attached to a merchant.
  // 200 OK with the wallet; 404 if it hasn't been provisioned yet (the
  // `merchant.created` event may not have been consumed yet).
  // -------------------------------------------------------------------------
  typed.get('/wallets/by-merchant/:merchantId', { schema: { params: merchantIdParamSchema } }, async (request) => {
    return deps.walletService.getByMerchantId({ merchantId: request.params.merchantId })
  })

  // -------------------------------------------------------------------------
  // GET /wallets/:id — fetch a single wallet by id, or 404.
  // -------------------------------------------------------------------------
  typed.get('/wallets/:id', { schema: { params: walletIdParamSchema } }, async (request) => {
    return deps.walletService.getById({ id: request.params.id })
  })

  // -------------------------------------------------------------------------
  // PATCH /wallets/:id/status — toggle active/inactive. Publishes
  // wallet.status_changed so transaction-service refreshes its projection.
  // 204 No Content on success.
  // -------------------------------------------------------------------------
  typed.patch(
    '/wallets/:id/status',
    {
      schema: {
        params: walletIdParamSchema,
        body: updateStatusBodySchema,
      },
    },
    async (request, reply) => {
      await deps.updateWalletStatusUseCase.execute({
        id: request.params.id,
        status: request.body.status,
      })
      void reply.status(204).send()
    },
  )
}
