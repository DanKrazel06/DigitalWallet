import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import type { WalletService } from '../../application/wallet.service.js'

export interface RoutesDeps {
  walletService: WalletService
}

const userIdParamSchema = z.object({ userId: z.string().uuid() })
const walletIdParamSchema = z.object({ id: z.string().uuid() })

export async function registerRoutes(app: FastifyInstance, deps: RoutesDeps): Promise<void> {
  const typed = app.withTypeProvider<ZodTypeProvider>()

  // GET /wallets/by-user/:userId — list all wallets belonging to a user.
  // Returns an empty array if none have been provisioned yet.
  typed.get(
    '/wallets/by-user/:userId',
    { schema: { params: userIdParamSchema } },
    async (request) => {
      return deps.walletService.listByUserId({ userId: request.params.userId })
    },
  )

  // GET /wallets/:id — fetch a single wallet by id, or 404.
  typed.get(
    '/wallets/:id',
    { schema: { params: walletIdParamSchema } },
    async (request) => {
      return deps.walletService.getById({ id: request.params.id })
    },
  )
}
