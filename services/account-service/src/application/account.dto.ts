// Application-layer DTOs for account-service.
// Kept in a dedicated file so the HTTP layer (and future consumers) can
// import only the contracts without pulling in the service implementation.

import type { KycStatus } from '../domain/account.js'

export interface AccountDto {
  id: string
  userId: string
  email: string
  firstName: string | null
  lastName: string | null
  kycStatus: KycStatus
  createdAt: string
  updatedAt: string
}

export interface GetByUserIdInput {
  userId: string
}

export interface GetByIdInput {
  id: string
}
