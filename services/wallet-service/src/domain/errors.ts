import { BaseDomainError } from '@walletdigital/http'

export const DomainError = BaseDomainError
export type DomainError = BaseDomainError

export class WalletAlreadyExistsError extends DomainError {
  readonly code = 'WALLET_ALREADY_EXISTS'
  constructor(userId: string, currency: string) {
    super(`A ${currency} wallet for user ${userId} already exists`)
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
