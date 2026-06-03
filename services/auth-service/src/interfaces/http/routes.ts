import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import type { AuthService } from '../../application/auth.service.js'
import type { SignupUseCase } from '../../application/signup.use-case.js'
import type { TokenService } from '../../domain/ports.js'
import { authenticate } from './authenticate.js'
import {
  loginBodySchema,
  logoutBodySchema,
  refreshBodySchema,
  signupBodySchema,
} from './schemas.js'

// Routes wiring — registers every HTTP endpoint and binds it to its
// corresponding use-case. The Fastify instance is expected to have the
// Zod type provider attached, so body schemas are validated automatically.
export interface RoutesDeps {
  authService: AuthService
  signupUseCase: SignupUseCase
  tokens: TokenService
}

export async function registerRoutes(app: FastifyInstance, deps: RoutesDeps): Promise<void> {
  const typed = app.withTypeProvider<ZodTypeProvider>()
  const requireAuth = authenticate(deps.tokens)

  // -------------------------------------------------------------------------
  // POST /signup — register a new user. Public.
  // 201 Created on success; 409 if email already exists.
  // -------------------------------------------------------------------------
  typed.post('/signup', { schema: { body: signupBodySchema } }, async (request, reply) => {
    const result = await deps.signupUseCase.execute(request.body)
    void reply.status(201).send(result)
  })

  // -------------------------------------------------------------------------
  // POST /login — authenticate and issue access + refresh tokens. Public.
  // 200 OK with tokens; 401 on bad credentials.
  // -------------------------------------------------------------------------
  typed.post('/login', { schema: { body: loginBodySchema } }, async (request) => {
    return deps.authService.login(request.body)
  })

  // -------------------------------------------------------------------------
  // POST /refresh — rotate refresh token, issue a new access token. Public.
  // 200 OK with new tokens; 401 if refresh token is invalid.
  // -------------------------------------------------------------------------
  typed.post('/refresh', { schema: { body: refreshBodySchema } }, async (request) => {
    return deps.authService.refresh(request.body)
  })

  // -------------------------------------------------------------------------
  // POST /logout — revoke a refresh token. Public (idempotent).
  // 204 No Content on success (always, even if the token was already gone).
  // -------------------------------------------------------------------------
  typed.post('/logout', { schema: { body: logoutBodySchema } }, async (request, reply) => {
    await deps.authService.logout(request.body)
    void reply.status(204).send()
  })

  // -------------------------------------------------------------------------
  // GET /me — return the authenticated user's profile. Requires JWT.
  // The userId is taken from the verified access token, never from the URL.
  // 200 OK with profile; 401 if no/invalid token; 404 if the user no longer
  // exists (deleted while their token was still valid).
  // -------------------------------------------------------------------------
  typed.get('/me', { preHandler: requireAuth }, async (request) => {
    // `request.user` is set by `authenticate` — non-null on this route.
    const userId = request.user!.id
    return deps.authService.getUserById({ userId })
  })
}
