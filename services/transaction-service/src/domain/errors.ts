import { BaseDomainError } from '@walletdigital/http'

export const DomainError = BaseDomainError
export type DomainError = BaseDomainError

// Wallet referenced by a charge/refund does not exist in this service's
// projection. Most likely because the wallet.created event has not been
// consumed yet — the client should retry shortly.
export class WalletNotFoundError extends DomainError {
  readonly code = 'WALLET_NOT_FOUND'
  constructor(id: string) {
    super(`No wallet found for id ${id}`)
  }
}

// Source wallet does not have enough balance. Persisted as a `declined`
// transaction so the audit trail is complete.
export class InsufficientFundsError extends DomainError {
  readonly code = 'INSUFFICIENT_FUNDS'
  constructor() {
    super('Insufficient funds')
  }
}

// One of the wallets is inactive. Persisted as declined.
export class WalletInactiveError extends DomainError {
  readonly code = 'WALLET_INACTIVE'
  constructor(walletId: string) {
    super(`Wallet ${walletId} is not active`)
  }
}

// The merchant initiating the operation is inactive. Persisted as declined.
export class MerchantInactiveError extends DomainError {
  readonly code = 'MERCHANT_INACTIVE'
  constructor(merchantId: string) {
    super(`Merchant ${merchantId} is not active`)
  }
}

// The merchant initiating the operation does not exist in this service's
// projection (event lag or unknown id).
export class MerchantNotFoundError extends DomainError {
  readonly code = 'MERCHANT_NOT_FOUND'
  constructor(merchantId: string) {
    super(`No merchant found for id ${merchantId}`)
  }
}

// Source and destination wallets are the same — meaningless. Persisted as
// declined.
export class SameWalletTransferError extends DomainError {
  readonly code = 'SAME_WALLET_TRANSFER'
  constructor() {
    super('Source and destination wallets must differ')
  }
}

// Refund references a transaction id that does not exist.
export class OriginalTransactionNotFoundError extends DomainError {
  readonly code = 'ORIGINAL_TRANSACTION_NOT_FOUND'
  constructor(id: string) {
    super(`Original transaction ${id} not found`)
  }
}

// Refund references a transaction that is not a `charge` (e.g. another
// refund). Out-of-scope behaviour for this milestone.
export class OriginalTransactionNotChargeError extends DomainError {
  readonly code = 'ORIGINAL_TRANSACTION_NOT_CHARGE'
  constructor(id: string, foundType: string) {
    super(`Original transaction ${id} is of type "${foundType}", expected "charge"`)
  }
}

// Refund references a charge that is not completed (e.g. declined).
export class OriginalTransactionNotCompletedError extends DomainError {
  readonly code = 'ORIGINAL_TRANSACTION_NOT_COMPLETED'
  constructor(id: string) {
    super(`Original transaction ${id} is not completed`)
  }
}

// Refund amount exceeds the original charge amount.
export class RefundExceedsChargeError extends DomainError {
  readonly code = 'REFUND_EXCEEDS_CHARGE'
  constructor() {
    super('Refund amount exceeds the original charge amount')
  }
}

// Transaction with the same idempotency key exists but with a different
// payload — refuse with 409.
export class IdempotencyConflictError extends DomainError {
  readonly code = 'IDEMPOTENCY_CONFLICT'
  constructor() {
    super('Idempotency key already used with a different payload')
  }
}

export class TransactionNotFoundError extends DomainError {
  readonly code = 'TRANSACTION_NOT_FOUND'
  constructor() {
    super('Transaction not found')
  }
}
