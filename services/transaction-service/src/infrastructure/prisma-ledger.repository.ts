import { Money, assertCurrency } from '../domain/money.js'
import { LedgerEntry } from '../domain/ledger-entry.js'
import type { LedgerRepository } from '../domain/ports.js'
import type { PrismaLike } from './prisma-types.js'

// PrismaLedgerRepository — append-only journal of debit/credit movements.
// Currency is read from the parent transaction row (joined) because the
// ledger table itself does not store it (a ledger entry inherits the
// currency of its transaction).
interface LedgerEntryRow {
  id: string
  transactionId: string
  walletId: string
  debit: bigint
  credit: bigint
  balanceAfter: bigint
  createdAt: Date
  transaction: { currency: string }
}

export class PrismaLedgerRepository implements LedgerRepository {
  constructor(private readonly prisma: PrismaLike) {}

  async insertMany(entries: LedgerEntry[]): Promise<void> {
    // createMany is faster than calling create() in a loop and runs in
    // a single round-trip. Inside a Prisma transaction it stays atomic.
    await this.prisma.ledgerEntry.createMany({
      data: entries.map((e) => {
        const snap = e.toSnapshot()
        return {
          id: snap.id,
          transactionId: snap.transactionId,
          walletId: snap.walletId,
          debit: snap.debit,
          credit: snap.credit,
          balanceAfter: snap.balanceAfter,
          createdAt: snap.createdAt,
        }
      }),
    })
  }

  async listByWalletId(walletId: string, limit: number): Promise<LedgerEntry[]> {
    const rows = (await this.prisma.ledgerEntry.findMany({
      where: { walletId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { transaction: { select: { currency: true } } },
    })) as LedgerEntryRow[]

    return rows.map((row) => {
      const currency = assertCurrency(row.transaction.currency)
      return LedgerEntry.rehydrate({
        id: row.id,
        transactionId: row.transactionId,
        walletId: row.walletId,
        debit: Money.fromMinor(row.debit, currency),
        credit: Money.fromMinor(row.credit, currency),
        balanceAfter: Money.fromMinor(row.balanceAfter, currency),
        createdAt: row.createdAt,
      })
    })
  }
}
