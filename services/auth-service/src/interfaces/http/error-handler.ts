import { createErrorHandler } from '@walletdigital/http'
import {
  DomainError,
  InvalidCredentialsError,
  InvalidEmailError,
  InvalidRefreshTokenError,
  UserAlreadyExistsError,
  UserNotFoundError,
  WeakPasswordError,
} from '../../domain/errors.js'

// auth-service maps each of its domain errors to an HTTP status code.
// The wrapping logic (validation handling, logging, 500 fallback) lives
// in the shared @walletdigital/http package.
export const errorHandler = createErrorHandler((err: DomainError) => {
  if (err instanceof UserAlreadyExistsError) return 409
  if (err instanceof UserNotFoundError) return 404
  if (err instanceof InvalidCredentialsError) return 401
  if (err instanceof InvalidRefreshTokenError) return 401
  if (err instanceof InvalidEmailError) return 400
  if (err instanceof WeakPasswordError) return 400
  return 400
})
