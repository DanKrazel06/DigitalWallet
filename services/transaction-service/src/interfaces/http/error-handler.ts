import { createErrorHandler } from '@walletdigital/http'
import type { DomainError } from '../../domain/errors.js'
import {
  IdempotencyConflictError,
  InsufficientFundsError,
  MerchantInactiveError,
  MerchantNotFoundError,
  OriginalTransactionNotChargeError,
  OriginalTransactionNotCompletedError,
  OriginalTransactionNotFoundError,
  RefundExceedsChargeError,
  SameWalletTransferError,
  TransactionNotFoundError,
  WalletInactiveError,
  WalletNotFoundError,
} from '../../domain/errors.js'

// transaction-service maps each of its domain errors to an HTTP status.
//   - 404 — wallet, merchant, transaction does not exist
//   - 409 — idempotency key reused with a different payload
//   - 422 — business rejection (declined: inactive, insufficient funds,
//           refund > charge, same wallet, refund of non-charge)
//   - 400 — fallback
export const errorHandler = createErrorHandler((err: DomainError) => {
  if (err instanceof WalletNotFoundError) return 404
  if (err instanceof MerchantNotFoundError) return 404
  if (err instanceof TransactionNotFoundError) return 404
  if (err instanceof OriginalTransactionNotFoundError) return 404
  if (err instanceof IdempotencyConflictError) return 409
  if (err instanceof InsufficientFundsError) return 422
  if (err instanceof MerchantInactiveError) return 422
  if (err instanceof WalletInactiveError) return 422
  if (err instanceof SameWalletTransferError) return 422
  if (err instanceof RefundExceedsChargeError) return 422
  if (err instanceof OriginalTransactionNotChargeError) return 422
  if (err instanceof OriginalTransactionNotCompletedError) return 422
  return 400
})
