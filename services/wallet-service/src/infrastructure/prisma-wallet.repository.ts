import { Money, type Currency, isCurrency } from '../domain/money.js'
import { Wallet, type WalletStatus } from '../domain/wallet.js'
import type { WalletRepository } from '../domain/ports.js'
import type { PrismaLike } from './prisma-types.js'

// PrismaWalletRepository — concrete implementation of WalletRepository.
//
// `balance` is stored as BigInt in Postgres. We translate it through the
// Money value object so the domain never sees raw bigints (would risk
// being mixed up with a different currency at the call site).
export class PrismaWalletRepository implements WalletRepository {
  constructor(private readonly prisma: PrismaLike) {}

  async findByUserAndCurrency(userId: string, currency: Currency): Promise<Wallet | null> {
    const row = await this.prisma.wallet.findUnique({
      where: { wallets_user_currency_unique: { userId, currency } },
    })
    return row === null ? null : this.toDomain(row)
  }

  async findAllByUserId(userId: string): Promise<Wallet[]> {
    const rows = await this.prisma.wallet.findMany({ where: { userId } })
    return rows.map((row) => this.toDomain(row))
  }

  async findById(id: string): Promise<Wallet | null> {
    const row = await this.prisma.wallet.findUnique({ where: { id } })
    return row === null ? null : this.toDomain(row)
  }

  async save(wallet: Wallet): Promise<void> {
    const snap = wallet.toSnapshot()
    await this.prisma.wallet.create({
      data: {
        id: snap.id,
        userId: snap.userId,
        accountId: snap.accountId,
        balance: snap.balance,
        currency: snap.currency,
        status: snap.status,
        createdAt: snap.createdAt,
        updatedAt: snap.updatedAt,
      },
    })
  }

  // toDomain — translate a raw Prisma row into a fully-formed Wallet
  // entity. Validates the currency string (must be a supported ISO code)
  // and reconstructs the Money value object so callers never deal with
  // a raw bigint disconnected from its currency.
  private toDomain(row: {
    id: string
    userId: string
    accountId: string
    balance: bigint
    currency: string
    status: string
    createdAt: Date
    updatedAt: Date
  }): Wallet {
    if (!isCurrency(row.currency)) {
      // Trust boundary: a row out-of-sync with our supported currencies
      // is a developer / migration error. Better to fail loudly here.
      throw new Error(`Unsupported currency in wallet row: ${row.currency}`)
    }
    return Wallet.rehydrate({
      id: row.id,
      userId: row.userId,
      accountId: row.accountId,
      balance: Money.fromMinor(row.balance, row.currency),
      status: row.status as WalletStatus,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    })
  }
}
