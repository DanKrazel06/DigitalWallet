import { createErrorHandler } from '@walletdigital/http'
import {
  DomainError,
  IdempotencyConflictError,
  InsufficientFundsError,
  SameWalletTransferError,
  TransactionNotFoundError,
  WalletFrozenError,
  WalletNotFoundError,
} from '../../domain/errors.js'

// transaction-service maps each of its domain errors to an HTTP status.
//   - 404 — wallet or transaction does not exist
//   - 409 — idempotency key reused with a different payload
//   - 422 — business rejection (insufficient funds, frozen, same wallet)
//   - 400 — fallback
export const errorHandler = createErrorHandler((err: DomainError) => {
  if (err instanceof WalletNotFoundError) return 404
  if (err instanceof TransactionNotFoundError) return 404
  if (err instanceof IdempotencyConflictError) return 409
  if (err instanceof InsufficientFundsError) return 422
  if (err instanceof WalletFrozenError) return 422
  if (err instanceof SameWalletTransferError) return 422
  return 400
})
