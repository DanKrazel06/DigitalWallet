import { BaseDomainError } from '@walletdigital/http'

export const DomainError = BaseDomainError
export type DomainError = BaseDomainError

// Wallet referenced by a transfer does not exist in this service's
// projection. Most likely because the wallet.created event has not been
// consumed yet — the client should retry shortly.
export class WalletNotFoundError extends DomainError {
  readonly code = 'WALLET_NOT_FOUND'
  constructor(userId: string) {
    super(`No wallet found for user ${userId}`)
  }
}

// Transfer would put the source wallet below zero. The transaction is
// persisted with status=failed; client receives 422.
export class InsufficientFundsError extends DomainError {
  readonly code = 'INSUFFICIENT_FUNDS'
  constructor() {
    super('Insufficient funds')
  }
}

// One of the wallets is frozen / closed. Persisted as failed; 422.
export class WalletFrozenError extends DomainError {
  readonly code = 'WALLET_FROZEN'
  constructor(walletId: string) {
    super(`Wallet ${walletId} is not active`)
  }
}

// Sender and receiver are the same wallet — meaningless. Persisted as
// failed; 422.
export class SameWalletTransferError extends DomainError {
  readonly code = 'SAME_WALLET_TRANSFER'
  constructor() {
    super('Source and destination wallets must differ')
  }
}

// Transaction with the given idempotency key exists but with a different
// payload. The client is reusing a key for a different operation — 409.
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
