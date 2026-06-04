import { BaseDomainError } from '@walletdigital/http'

export const DomainError = BaseDomainError
export type DomainError = BaseDomainError

// A wallet already exists for the given merchant — one merchant has at
// most one wallet (mono-currency milestone).
export class WalletAlreadyExistsError extends DomainError {
  readonly code = 'WALLET_ALREADY_EXISTS'
  constructor(merchantId: string) {
    super(`A wallet for merchant ${merchantId} already exists`)
  }
}

export class WalletNotFoundError extends DomainError {
  readonly code = 'WALLET_NOT_FOUND'
  constructor() {
    super('Wallet not found')
  }
}

export class InvalidCurrencyError extends DomainError {
  readonly code = 'INVALID_CURRENCY'
  constructor(raw: string) {
    super(`Unsupported currency: "${raw}"`)
  }
}

export class InvalidWalletStatusError extends DomainError {
  readonly code = 'INVALID_WALLET_STATUS'
  constructor(raw: string) {
    super(`Invalid wallet status: "${raw}"`)
  }
}
