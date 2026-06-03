import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import type { AccountService } from '../../application/account.service.js'

// Routes wiring for account-service.
// At this milestone we expose only read endpoints. Write operations
// (profile update, KYC verification) will come in a later iteration.
export interface RoutesDeps {
  accountService: AccountService
}

const userIdParamSchema = z.object({
  userId: z.string().uuid(),
})

export async function registerRoutes(app: FastifyInstance, deps: RoutesDeps): Promise<void> {
  const typed = app.withTypeProvider<ZodTypeProvider>()

  // -------------------------------------------------------------------------
  // GET /accounts/by-user/:userId — fetch a profile by auth-service userId.
  // 200 OK with the profile; 404 if no account exists for that user.
  //
  // The API gateway will translate /me into a call here using the JWT sub.
  // -------------------------------------------------------------------------
  typed.get(
    '/accounts/by-user/:userId',
    { schema: { params: userIdParamSchema } },
    async (request) => {
      return deps.accountService.getByUserId({ userId: request.params.userId })
    },
  )
}
