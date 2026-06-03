import { AccountNotFoundError } from '../domain/errors.js'
import type { Account } from '../domain/account.js'
import type { AccountRepository } from '../domain/ports.js'
import type { AccountDto, GetByIdInput, GetByUserIdInput } from './account.dto.js'

// AccountService — groups the read-side operations on accounts.
//
// Write operations that emit events (creation, KYC verification, ...) are
// kept in dedicated UseCase classes because they require additional deps
// (UnitOfWork, OutboxWriter) and a transactional context that the simple
// lookup operations grouped here do not need.
export class AccountService {
  constructor(private readonly accounts: AccountRepository) {}

  // -------------------------------------------------------------------------
  // getByUserId — fetch the profile attached to an auth-service userId.
  // Used by HTTP `GET /accounts/by-user/:userId` and by the future
  // `GET /me` endpoint at the gateway (which forwards the JWT sub).
  // -------------------------------------------------------------------------
  async getByUserId(input: GetByUserIdInput): Promise<AccountDto> {
    const account = await this.accounts.findByUserId(input.userId)
    if (account === null) {
      throw new AccountNotFoundError()
    }
    return toDto(account)
  }

  // -------------------------------------------------------------------------
  // getById — fetch a profile by its own id. Mainly used by internal
  // tooling (admin, dashboards). HTTP endpoint added when needed.
  // -------------------------------------------------------------------------
  async getById(input: GetByIdInput): Promise<AccountDto> {
    const account = await this.accounts.findById(input.id)
    if (account === null) {
      throw new AccountNotFoundError()
    }
    return toDto(account)
  }
}

// Mapping helper kept private to this file: domain types must not leak
// across the application boundary.
function toDto(account: Account): AccountDto {
  return {
    id: account.id,
    userId: account.userId,
    email: account.email,
    firstName: account.firstName,
    lastName: account.lastName,
    kycStatus: account.kycStatus,
    createdAt: account.createdAt.toISOString(),
    updatedAt: account.updatedAt.toISOString(),
  }
}
