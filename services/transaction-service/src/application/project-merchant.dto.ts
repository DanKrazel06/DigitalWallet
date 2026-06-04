import type { MerchantStatus } from '../domain/merchant-projection.js'

// Input projected from a `merchant.created` Kafka event.
export interface ProjectMerchantFromCreatedInput {
  merchantId: string
}

// Input projected from a `merchant.status_changed` Kafka event.
export interface ProjectMerchantStatusInput {
  merchantId: string
  status: MerchantStatus
}
