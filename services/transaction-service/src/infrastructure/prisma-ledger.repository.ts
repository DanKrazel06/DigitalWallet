import { Money, assertCurrency } from '../domain/money.js'
import { LedgerEntry } from '../domain/ledger-entry.js'
import type { TransactionType } from '../domain/transaction.js'
import type { LedgerRepository } from '../domain/ports.js'
import type { PrismaLike } from './prisma-types.js'

// PrismaLedgerRepository — append-only journal of debit/credit movements.
// Currency is read from the parent transaction row (joined) because the
// ledger table itself does not store it (a ledger entry inherits the
// currency of its transaction).
interface LedgerEntryRow {
  id: string
  transactionId: string
  type: string
  walletId: string
  debit: { toString(): string }
  credit: { toString(): string }
  balanceAfter: { toString(): string }
  createdAt: Date
  transaction: { currency: string }
}

export class PrismaLedgerRepository implements LedgerRepository {
  constructor(private readonly prisma: PrismaLike) {}

  async insertMany(entries: LedgerEntry[]): Promise<void> {
    // createMany is faster than calling create() in a loop and runs in
    // a single round-trip. Inside a Prisma transaction it stays atomic.
    await this.prisma.ledgerEntry.createMany({
      data: entries.map((e) => ({
        id: e.id,
        transactionId: e.transactionId,
        type: e.type,
        walletId: e.walletId,
        debit: e.debit.toDecimalString(),
        credit: e.credit.toDecimalString(),
        balanceAfter: e.balanceAfter.toDecimalString(),
        createdAt: e.createdAt,
      })),
    })
  }

  async listByWalletId(walletId: string, limit: number, offset: number): Promise<LedgerEntry[]> {
    const rows = (await this.prisma.ledgerEntry.findMany({
      where: { walletId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
      include: { transaction: { select: { currency: true } } },
    })) as unknown as LedgerEntryRow[]
    return rows.map((row) => this.toDomain(row))
  }

  // listByTransactionId — returns the (typically 2) entries that share a
  // transaction id. Ordered chronologically so consumers see debit before
  // credit when the underlying inserts happened in that order.
  async listByTransactionId(transactionId: string): Promise<LedgerEntry[]> {
    const rows = (await this.prisma.ledgerEntry.findMany({
      where: { transactionId },
      orderBy: { createdAt: 'asc' },
      include: { transaction: { select: { currency: true } } },
    })) as unknown as LedgerEntryRow[]
    return rows.map((row) => this.toDomain(row))
  }

  // toDomain — translate a Prisma row (with its parent transaction's
  // currency joined in) into a fully-formed LedgerEntry domain object.
  private toDomain(row: LedgerEntryRow): LedgerEntry {
    const currency = assertCurrency(row.transaction.currency)
    return LedgerEntry.rehydrate({
      id: row.id,
      transactionId: row.transactionId,
      type: row.type as TransactionType,
      walletId: row.walletId,
      debit: Money.fromDecimalString(row.debit.toString(), currency),
      credit: Money.fromDecimalString(row.credit.toString(), currency),
      balanceAfter: Money.fromDecimalString(row.balanceAfter.toString(), currency),
      createdAt: row.createdAt,
    })
  }

  // sumDebitsByTransactionId — used by refund flow to check that the
  // requested refund amount fits within the original charge. Returns
  // the bigint sum in MINOR UNITS (cents), or 0n if no entries match.
  async sumDebitsByTransactionId(transactionId: string): Promise<bigint> {
    const rows = await this.prisma.$queryRawUnsafe<{ sum: string | null }[]>(
      // $1 must be cast to uuid (see comment in prisma-wallet-projection
      // findForUpdateById for the same Postgres v10+ quirk).
      'SELECT COALESCE(SUM(debit), 0)::text AS sum FROM ledger_entries WHERE transaction_id = $1::uuid',
      transactionId,
    )
    const raw = rows[0]?.sum ?? '0'
    // The DB returns the sum as decimal text like "100.0000". Convert
    // through Money so we reuse the same minor-unit conversion logic.
    const [whole, fraction = ''] = raw.split('.')
    const padded = (fraction + '00').slice(0, 2)
    return BigInt((whole ?? '0') + padded)
  }
}
