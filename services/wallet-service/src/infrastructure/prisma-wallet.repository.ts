import { Money, assertCurrency } from '@walletdigital/money'
import { Wallet, type WalletStatus } from '../domain/wallet.js'
import type { WalletRepository } from '../domain/ports.js'
import type { PrismaLike } from './prisma-types.js'

// PrismaWalletRepository — concrete implementation of WalletRepository.
//
// Money flows through `Money` value object internally (bigint minor
// units). DB stores `balance` as Decimal(20, 4); we use
// `Money.fromDecimalString` / `Money.toDecimalString` at this boundary
// to translate without ever touching a JS float.
//
// `save` uses upsert so the same method handles create (from the
// merchant event consumer / POST /wallets) and update (status changes,
// balance sync from `transaction.completed`).
export class PrismaWalletRepository implements WalletRepository {
  constructor(private readonly prisma: PrismaLike) {}

  async findByMerchantId(merchantId: string): Promise<Wallet | null> {
    const row = await this.prisma.wallet.findUnique({ where: { merchantId } })
    return row === null ? null : this.toDomain(row)
  }

  async findById(id: string): Promise<Wallet | null> {
    const row = await this.prisma.wallet.findUnique({ where: { id } })
    return row === null ? null : this.toDomain(row)
  }

  async save(wallet: Wallet): Promise<void> {
    const snap = wallet.toSnapshot()
    const balanceDecimal = wallet.balance.toDecimalString()
    await this.prisma.wallet.upsert({
      where: { id: snap.id },
      create: {
        id: snap.id,
        merchantId: snap.merchantId,
        currency: snap.currency,
        balance: balanceDecimal,
        status: snap.status,
        createdAt: snap.createdAt,
        updatedAt: snap.updatedAt,
      },
      update: {
        balance: balanceDecimal,
        status: snap.status,
        updatedAt: snap.updatedAt,
      },
    })
  }

  // toDomain — translate a raw Prisma row into a fully-formed Wallet
  // entity. Validates the currency string (must be a supported ISO code)
  // and reconstructs the Money value object so callers never deal with
  // a raw Decimal disconnected from its currency.
  private toDomain(row: {
    id: string
    merchantId: string
    balance: { toString(): string }
    currency: string
    status: string
    createdAt: Date
    updatedAt: Date
  }): Wallet {
    const currency = assertCurrency(row.currency)
    return Wallet.rehydrate({
      id: row.id,
      merchantId: row.merchantId,
      balance: Money.fromDecimalString(row.balance.toString(), currency),
      status: row.status as WalletStatus,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    })
  }
}
