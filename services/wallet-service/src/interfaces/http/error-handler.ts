import { createErrorHandler } from '@walletdigital/http'
import type { DomainError } from '../../domain/errors.js'
import {
  InvalidCurrencyError,
  InvalidWalletStatusError,
  WalletAlreadyExistsError,
  WalletNotFoundError,
} from '../../domain/errors.js'

// wallet-service maps each of its domain errors to an HTTP status code.
export const errorHandler = createErrorHandler((err: DomainError) => {
  if (err instanceof WalletNotFoundError) return 404
  if (err instanceof WalletAlreadyExistsError) return 409
  if (err instanceof InvalidCurrencyError) return 400
  if (err instanceof InvalidWalletStatusError) return 400
  return 400
})
