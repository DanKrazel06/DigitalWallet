import { createErrorHandler } from '@walletdigital/http'
import {
  AccountAlreadyExistsError,
  AccountNotFoundError,
  DomainError,
} from '../../domain/errors.js'

// account-service maps each of its domain errors to an HTTP status code.
// The wrapping logic lives in @walletdigital/http.
export const errorHandler = createErrorHandler((err: DomainError) => {
  if (err instanceof AccountNotFoundError) return 404
  if (err instanceof AccountAlreadyExistsError) return 409
  return 400
})
