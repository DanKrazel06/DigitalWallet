import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify'

// Generic Fastify error handler factory.
//
// Each service has its own set of domain error classes and its own
// preferred HTTP mapping. This factory captures the boilerplate (logging,
// validation handling, fallback 500) and leaves the per-service decision
// (which DomainError → which status code) to the caller through the
// `domainErrorStatus` function.
//
// Usage:
//   import { createErrorHandler, BaseDomainError } from '@walletdigital/http'
//
//   class UserNotFoundError extends BaseDomainError { code = 'USER_NOT_FOUND' }
//   class InvalidCredentialsError extends BaseDomainError { code = 'INVALID_CREDENTIALS' }
//
//   const errorHandler = createErrorHandler((err) => {
//     if (err instanceof UserNotFoundError) return 404
//     if (err instanceof InvalidCredentialsError) return 401
//     return 400
//   })
//
//   app.setErrorHandler(errorHandler)

// Common base class for every domain error across the codebase.
// Services extend this so the generic handler can recognise them via
// `instanceof` without having to import every service's error catalogue.
export abstract class BaseDomainError extends Error {
  abstract readonly code: string
  constructor(message: string) {
    super(message)
    this.name = this.constructor.name
  }
}

export interface ErrorResponseBody {
  code: string
  message: string
  details?: unknown
}

// Caller-supplied function returning the HTTP status for a given domain
// error instance. Should return a sensible default (e.g. 400) if no
// specific mapping matches.
export type DomainErrorStatusMapper = (err: BaseDomainError) => number

export function createErrorHandler(domainErrorStatus: DomainErrorStatusMapper) {
  return function errorHandler(
    err: FastifyError,
    request: FastifyRequest,
    reply: FastifyReply,
  ): void {
    // Fastify attaches `validation` when the request body / params fail
    // the route schema. We translate to a 400 with a stable error code
    // so clients can react programmatically.
    if (err.validation !== undefined) {
      request.log.warn({ err, route: request.routeOptions?.url }, 'request validation failed')
      const body: ErrorResponseBody = {
        code: 'VALIDATION_FAILED',
        message: 'Request validation failed',
        details: err.validation,
      }
      void reply.status(400).send(body)
      return
    }

    if (err instanceof BaseDomainError) {
      // Warn (not error): domain errors are EXPECTED business outcomes,
      // not bugs. Logging at error level would flood prod dashboards.
      request.log.warn({ code: err.code, message: err.message }, 'domain error')
      const body: ErrorResponseBody = { code: err.code, message: err.message }
      void reply.status(domainErrorStatus(err)).send(body)
      return
    }

    // Unhandled error → 500. Full stack logged server-side, generic
    // message exposed to the client (no information disclosure).
    request.log.error({ err }, 'unhandled error')
    void reply
      .status(500)
      .send({ code: 'INTERNAL_ERROR', message: 'Internal server error' })
  }
}
