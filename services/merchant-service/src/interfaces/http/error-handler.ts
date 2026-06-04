import { createErrorHandler } from '@walletdigital/http'
import type { DomainError } from '../../domain/errors.js'
import { InvalidMerchantStatusError, MerchantNotFoundError } from '../../domain/errors.js'

// merchant-service maps each of its domain errors to an HTTP status code.
// The generic wrapping logic (validation handling, logging, 500 fallback)
// lives in the shared @walletdigital/http package.
export const errorHandler = createErrorHandler((err: DomainError) => {
  if (err instanceof MerchantNotFoundError) return 404
  if (err instanceof InvalidMerchantStatusError) return 400
  return 400
})
