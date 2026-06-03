// Domain errors for account-service.
// Re-exporting BaseDomainError as `DomainError` for in-service consistency,
// while the shared HTTP error handler recognises errors via BaseDomainError.
import { BaseDomainError } from '@walletdigital/http'

export const DomainError = BaseDomainError
export type DomainError = BaseDomainError

export class AccountAlreadyExistsError extends DomainError {
  readonly code = 'ACCOUNT_ALREADY_EXISTS'
  constructor(userId: string) {
    super(`An account for user ${userId} already exists`)
  }
}

export class AccountNotFoundError extends DomainError {
  readonly code = 'ACCOUNT_NOT_FOUND'
  constructor() {
    super('Account not found')
  }
}
