import type { MerchantType } from '../domain/merchant.js'

export interface CreateMerchantInput {
  name: string
  type: MerchantType
}

export interface CreateMerchantOutput {
  merchantId: string
  name: string
  type: MerchantType
  createdAt: string
}
