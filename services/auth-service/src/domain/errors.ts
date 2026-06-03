// Domain errors are pure value types — no HTTP status, no logger, no
// framework concerns. The HTTP layer maps each error class to a status
// code; tests assert on the class. Adding a new error here is the canonical
// way to introduce a new business outcome.
//
// We re-export BaseDomainError as `DomainError` so the generic HTTP
// handler (which works against BaseDomainError) can recognise our errors
// via `instanceof`, while in-service imports keep using `DomainError`.
import { BaseDomainError } from '@walletdigital/http'

export const DomainError = BaseDomainError
export type DomainError = BaseDomainError

export class InvalidEmailError extends DomainError {
  readonly code = 'INVALID_EMAIL'
  constructor(raw: string) {
    super(`Invalid email format: "${raw}"`)
  }
}

export class WeakPasswordError extends DomainError {
  readonly code = 'WEAK_PASSWORD'
  constructor(reason: string) {
    super(`Password rejected: ${reason}`)
  }
}

export class UserAlreadyExistsError extends DomainError {
  readonly code = 'USER_ALREADY_EXISTS'
  constructor(email: string) {
    super(`A user with email "${email}" already exists`)
  }
}

export class UserNotFoundError extends DomainError {
  readonly code = 'USER_NOT_FOUND'
  constructor() {
    super('User not found')
  }
}

export class InvalidCredentialsError extends DomainError {
  readonly code = 'INVALID_CREDENTIALS'
  constructor() {
    // Generic message on purpose — never leak which side (email/password)
    // is wrong, to avoid user enumeration.
    super('Invalid credentials')
  }
}

export class InvalidRefreshTokenError extends DomainError {
  readonly code = 'INVALID_REFRESH_TOKEN'
  constructor() {
    super('Refresh token is invalid, expired, or revoked')
  }
}
