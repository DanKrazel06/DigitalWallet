import type { FastifyReply, FastifyRequest } from 'fastify'
import type { TokenService } from '../../domain/ports.js'

// Authenticated user attached to the Fastify request when the JWT is valid.
// Routes protected by the `authenticate` pre-handler can rely on
// `request.user` being set before their handler runs.
export interface AuthenticatedUser {
  id: string
  email: string
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthenticatedUser
  }
}

// authenticate — builds a Fastify pre-handler that:
//   1. reads the Authorization header
//   2. extracts the Bearer token
//   3. verifies it via TokenService (signature + expiration + issuer + aud)
//   4. attaches the decoded user to request.user
//
// Used on protected routes like:
//   app.get('/me', { preHandler: authenticate(tokens) }, handler)
//
// On any failure (missing header, bad format, expired, bad signature) the
// pre-handler short-circuits with a 401 — the route handler never runs.
export function authenticate(tokens: TokenService) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const header = request.headers.authorization
    if (header === undefined || !header.startsWith('Bearer ')) {
      void reply.status(401).send({
        code: 'UNAUTHENTICATED',
        message: 'Missing or malformed Authorization header',
      })
      return
    }

    const token = header.slice('Bearer '.length).trim()
    try {
      const payload = await tokens.verifyAccessToken(token)
      request.user = { id: payload.sub, email: payload.email }
    } catch (err) {
      request.log.debug({ err }, 'access token verification failed')
      void reply.status(401).send({
        code: 'UNAUTHENTICATED',
        message: 'Invalid or expired access token',
      })
    }
  }
}
