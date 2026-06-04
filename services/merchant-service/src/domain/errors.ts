import { BaseDomainError } from '@walletdigital/http'

export const DomainError = BaseDomainError
export type DomainError = BaseDomainError

export class MerchantNotFoundError extends DomainError {
  readonly code = 'MERCHANT_NOT_FOUND'
  constructor() {
    super('Merchant not found')
  }
}

export class InvalidMerchantStatusError extends DomainError {
  readonly code = 'INVALID_MERCHANT_STATUS'
  constructor(raw: string) {
    super(`Invalid merchant status: "${raw}"`)
  }
}
