import { MerchantNotFoundError } from '../domain/errors.js'
import type { Merchant } from '../domain/merchant.js'
import type { MerchantRepository } from '../domain/ports.js'
import type { GetMerchantInput, MerchantDto } from './merchant.dto.js'

// MerchantService — read-side operations on merchants.
// Write operations (create, status change) live in dedicated use-cases
// because they each carry a transactional concern (outbox event published
// inside the same Postgres transaction).
export class MerchantService {
  constructor(private readonly merchants: MerchantRepository) {}

  // -------------------------------------------------------------------------
  // getById — fetch a single merchant by id, or throw MerchantNotFound.
  // -------------------------------------------------------------------------
  async getById(input: GetMerchantInput): Promise<MerchantDto> {
    const merchant = await this.merchants.findById(input.id)
    if (merchant === null) {
      throw new MerchantNotFoundError()
    }
    return toDto(merchant)
  }
}

function toDto(m: Merchant): MerchantDto {
  return {
    id: m.id,
    name: m.name,
    type: m.type,
    status: m.status,
    createdAt: m.createdAt.toISOString(),
    updatedAt: m.updatedAt.toISOString(),
  }
}
