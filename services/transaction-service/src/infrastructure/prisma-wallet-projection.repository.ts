import { Money, assertCurrency } from '../domain/money.js'
import { WalletProjection, type WalletStatus } from '../domain/wallet-projection.js'
import type { WalletProjectionRepository } from '../domain/ports.js'
import type { PrismaLike } from './prisma-types.js'

// PrismaWalletProjectionRepository — concrete implementation.
//
// `balance` lives in Postgres as Decimal(20, 4); we bridge to the
// domain's Money (bigint minor units) via Money.fromDecimalString /
// toDecimalString. Never touches a JS float.
export class PrismaWalletProjectionRepository implements WalletProjectionRepository {
  constructor(private readonly prisma: PrismaLike) {}

  async findById(id: string): Promise<WalletProjection | null> {
    const row = await this.prisma.wallet.findUnique({ where: { id } })
    return row === null ? null : this.toDomain(row)
  }

  async findByMerchantId(merchantId: string): Promise<WalletProjection | null> {
    const row = await this.prisma.wallet.findUnique({ where: { merchantId } })
    return row === null ? null : this.toDomain(row)
  }

  // findForUpdateById — pessimistic lock variant. MUST be called from
  // within a Postgres transaction (UnitOfWork). Uses a raw query because
  // Prisma's high-level API doesn't expose FOR UPDATE on findUnique.
  // The DECIMAL is cast to text so we can pipe it through
  // Money.fromDecimalString without surprises from Prisma's Decimal
  // wrapper coming back from raw queries.
  async findForUpdateById(id: string): Promise<WalletProjection | null> {
    const rows = await this.prisma.$queryRawUnsafe<
      {
        id: string
        merchant_id: string
        balance: string
        currency: string
        status: string
        updated_at: Date
      }[]
    >(
      // Cast `$1` to uuid explicitly: Postgres rejects `uuid = text`
      // comparisons since v10, and `$queryRawUnsafe` binds the parameter
      // as text by default. Same trick used everywhere we lock by uuid.
      'SELECT id, merchant_id, balance::text AS balance, currency, status, updated_at FROM wallets WHERE id = $1::uuid FOR UPDATE',
      id,
    )
    const row = rows[0]
    if (row === undefined) {
      return null
    }
    return this.toDomain({
      id: row.id,
      merchantId: row.merchant_id,
      balance: row.balance,
      currency: row.currency,
      status: row.status,
      updatedAt: row.updated_at,
    })
  }

  async insert(wallet: WalletProjection): Promise<void> {
    const snap = wallet.toSnapshot()
    await this.prisma.wallet.create({
      data: {
        id: snap.id,
        merchantId: snap.merchantId,
        balance: wallet.balance.toDecimalString(),
        currency: snap.currency,
        status: snap.status,
        updatedAt: snap.updatedAt,
      },
    })
  }

  async update(wallet: WalletProjection): Promise<void> {
    const snap = wallet.toSnapshot()
    await this.prisma.wallet.update({
      where: { id: snap.id },
      data: {
        balance: wallet.balance.toDecimalString(),
        status: snap.status,
        updatedAt: snap.updatedAt,
      },
    })
  }

  private toDomain(row: {
    id: string
    merchantId: string
    balance: { toString(): string } | string
    currency: string
    status: string
    updatedAt: Date
  }): WalletProjection {
    const currency = assertCurrency(row.currency)
    const balanceString = typeof row.balance === 'string' ? row.balance : row.balance.toString()
    return WalletProjection.rehydrate({
      id: row.id,
      merchantId: row.merchantId,
      balance: Money.fromDecimalString(balanceString, currency),
      status: row.status as WalletStatus,
      updatedAt: row.updatedAt,
    })
  }
}
