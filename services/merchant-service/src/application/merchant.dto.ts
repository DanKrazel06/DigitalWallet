import type { MerchantStatus, MerchantType } from '../domain/merchant.js'

// Public representation of a merchant returned by the API.
export interface MerchantDto {
  id: string
  name: string
  type: MerchantType
  status: MerchantStatus
  createdAt: string
  updatedAt: string
}

export interface GetMerchantInput {
  id: string
}

export interface UpdateMerchantStatusInput {
  id: string
  status: MerchantStatus
}
