import { Merchant, type MerchantStatus, type MerchantType } from '../domain/merchant.js'
import type { MerchantRepository } from '../domain/ports.js'
import type { PrismaLike } from './prisma-types.js'

// PrismaMerchantRepository — concrete implementation of MerchantRepository.
// The repository is the only place that knows about the Prisma row shape;
// use-cases see only domain types.
//
// `save` uses upsert so the same method handles both create (called from
// CreateMerchantUseCase) and update (UpdateMerchantStatusUseCase).
export class PrismaMerchantRepository implements MerchantRepository {
  constructor(private readonly prisma: PrismaLike) {}

  async findById(id: string): Promise<Merchant | null> {
    const row = await this.prisma.merchant.findUnique({ where: { id } })
    return row === null ? null : this.toDomain(row)
  }

  async save(merchant: Merchant): Promise<void> {
    const snap = merchant.toSnapshot()
    await this.prisma.merchant.upsert({
      where: { id: snap.id },
      create: {
        id: snap.id,
        name: snap.name,
        type: snap.type,
        status: snap.status,
        createdAt: snap.createdAt,
        updatedAt: snap.updatedAt,
      },
      update: {
        name: snap.name,
        status: snap.status,
        updatedAt: snap.updatedAt,
      },
    })
  }

  // toDomain — translate a raw Prisma row into a fully-formed Merchant
  // entity. Narrows the raw type/status strings to the strict domain
  // unions; an out-of-band value here would be a developer error.
  private toDomain(row: {
    id: string
    name: string
    type: string
    status: string
    createdAt: Date
    updatedAt: Date
  }): Merchant {
    return Merchant.rehydrate({
      id: row.id,
      name: row.name,
      type: row.type as MerchantType,
      status: row.status as MerchantStatus,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    })
  }
}
