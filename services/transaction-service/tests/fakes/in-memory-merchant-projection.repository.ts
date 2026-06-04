import type { MerchantProjection } from '../../src/domain/merchant-projection.js'
import type { MerchantProjectionRepository } from '../../src/domain/ports.js'

// InMemoryMerchantProjectionRepository — fake for unit tests.
export class InMemoryMerchantProjectionRepository implements MerchantProjectionRepository {
  private readonly byId = new Map<string, MerchantProjection>()

  seed(merchant: MerchantProjection): void {
    this.byId.set(merchant.id, merchant)
  }

  async findById(id: string): Promise<MerchantProjection | null> {
    return this.byId.get(id) ?? null
  }

  async insert(merchant: MerchantProjection): Promise<void> {
    if (this.byId.has(merchant.id)) {
      throw Object.assign(new Error('unique violation'), { code: 'P2002' })
    }
    this.byId.set(merchant.id, merchant)
  }

  async update(merchant: MerchantProjection): Promise<void> {
    this.byId.set(merchant.id, merchant)
  }
}
