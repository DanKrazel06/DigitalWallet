import { MerchantProjection, type MerchantStatus } from '../domain/merchant-projection.js'
import type { MerchantProjectionRepository } from '../domain/ports.js'
import type { PrismaLike } from './prisma-types.js'

// PrismaMerchantProjectionRepository — local merchant projection (id + status).
// Fed by merchant.created / merchant.status_changed consumers.
export class PrismaMerchantProjectionRepository implements MerchantProjectionRepository {
  constructor(private readonly prisma: PrismaLike) {}

  async findById(id: string): Promise<MerchantProjection | null> {
    const row = await this.prisma.merchant.findUnique({ where: { id } })
    return row === null ? null : this.toDomain(row)
  }

  async insert(merchant: MerchantProjection): Promise<void> {
    const snap = merchant.toSnapshot()
    await this.prisma.merchant.create({
      data: {
        id: snap.id,
        status: snap.status,
        updatedAt: snap.updatedAt,
      },
    })
  }

  async update(merchant: MerchantProjection): Promise<void> {
    const snap = merchant.toSnapshot()
    await this.prisma.merchant.update({
      where: { id: snap.id },
      data: {
        status: snap.status,
        updatedAt: snap.updatedAt,
      },
    })
  }

  private toDomain(row: { id: string; status: string; updatedAt: Date }): MerchantProjection {
    return MerchantProjection.rehydrate({
      id: row.id,
      status: row.status as MerchantStatus,
      updatedAt: row.updatedAt,
    })
  }
}
