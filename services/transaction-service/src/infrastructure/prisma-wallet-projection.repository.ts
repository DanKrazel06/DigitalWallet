import { Money, assertCurrency } from '../domain/money.js'
import { WalletProjection, type WalletStatus } from '../domain/wallet-projection.js'
import type { WalletProjectionRepository } from '../domain/ports.js'
import type { PrismaLike } from './prisma-types.js'

// PrismaWalletProjectionRepository — local read/write view of wallets.
//
// `findForUpdateByUserId` issues a `SELECT ... FOR UPDATE` so that two
// concurrent transfers from the same wallet are serialised: the second
// one blocks until the first commits. The lock is RELEASED at the end of
// the surrounding Postgres transaction — calling this method outside a
// transaction is pointless (the lock vanishes immediately).
interface WalletRow {
  id: string
  userId: string
  balance: bigint
  currency: string
  status: string
  updatedAt: Date
}

export class PrismaWalletProjectionRepository implements WalletProjectionRepository {
  constructor(private readonly prisma: PrismaLike) {}

  async findByUserId(userId: string): Promise<WalletProjection | null> {
    const row = await this.prisma.wallet.findUnique({ where: { userId } })
    return row === null ? null : toDomain(row)
  }

  async findById(id: string): Promise<WalletProjection | null> {
    const row = await this.prisma.wallet.findUnique({ where: { id } })
    return row === null ? null : toDomain(row)
  }

  // Row-level lock used inside CreateTransferUseCase. Raw SQL because
  // Prisma's typed query API does not expose `FOR UPDATE`. Returns null
  // when the wallet does not exist yet.
  async findForUpdateByUserId(userId: string): Promise<WalletProjection | null> {
    const rows = await this.prisma.$queryRawUnsafe<WalletRow[]>(
      `SELECT id, user_id AS "userId", balance, currency, status, updated_at AS "updatedAt"
         FROM wallets
        WHERE user_id = $1::uuid
        FOR UPDATE`,
      userId,
    )
    const row = rows[0]
    return row === undefined ? null : toDomain(row)
  }

  async insert(wallet: WalletProjection): Promise<void> {
    const snap = wallet.toSnapshot()
    await this.prisma.wallet.create({
      data: {
        id: snap.id,
        userId: snap.userId,
        balance: snap.balance,
        currency: snap.currency,
        status: snap.status,
      },
    })
  }

  async update(wallet: WalletProjection): Promise<void> {
    const snap = wallet.toSnapshot()
    await this.prisma.wallet.update({
      where: { id: snap.id },
      data: {
        balance: snap.balance,
        status: snap.status,
      },
    })
  }
}

function toDomain(row: WalletRow): WalletProjection {
  return WalletProjection.rehydrate({
    id: row.id,
    userId: row.userId,
    balance: Money.fromMinor(row.balance, assertCurrency(row.currency)),
    status: row.status as WalletStatus,
    updatedAt: row.updatedAt,
  })
}
