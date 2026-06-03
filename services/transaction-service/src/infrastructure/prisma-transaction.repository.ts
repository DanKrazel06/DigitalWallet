import { Money, assertCurrency } from '../domain/money.js'
import { Transaction, type TransactionStatus } from '../domain/transaction.js'
import type { TransactionRepository } from '../domain/ports.js'
import type { PrismaLike } from './prisma-types.js'

interface TransactionRow {
  id: string
  idempotencyKey: string
  fromWalletId: string
  toWalletId: string
  fromUserId: string
  toUserId: string
  amount: bigint
  currency: string
  status: string
  failureReason: string | null
  createdAt: Date
}

export class PrismaTransactionRepository implements TransactionRepository {
  constructor(private readonly prisma: PrismaLike) {}

  async findById(id: string): Promise<Transaction | null> {
    const row = await this.prisma.transaction.findUnique({ where: { id } })
    return row === null ? null : toDomain(row)
  }

  async findByIdempotencyKey(key: string): Promise<Transaction | null> {
    const row = await this.prisma.transaction.findUnique({
      where: { idempotencyKey: key },
    })
    return row === null ? null : toDomain(row)
  }

  async listByUserId(userId: string, limit: number, offset: number): Promise<Transaction[]> {
    const rows = await this.prisma.transaction.findMany({
      where: {
        OR: [{ fromUserId: userId }, { toUserId: userId }],
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    })
    return rows.map(toDomain)
  }

  async insert(transaction: Transaction): Promise<void> {
    const snap = transaction.toSnapshot()
    await this.prisma.transaction.create({
      data: {
        id: snap.id,
        idempotencyKey: snap.idempotencyKey,
        fromWalletId: snap.fromWalletId,
        toWalletId: snap.toWalletId,
        fromUserId: snap.fromUserId,
        toUserId: snap.toUserId,
        amount: snap.amount,
        currency: snap.currency,
        status: snap.status,
        failureReason: snap.failureReason,
        createdAt: snap.createdAt,
      },
    })
  }
}

function toDomain(row: TransactionRow): Transaction {
  return Transaction.rehydrate({
    id: row.id,
    idempotencyKey: row.idempotencyKey,
    fromWalletId: row.fromWalletId,
    toWalletId: row.toWalletId,
    fromUserId: row.fromUserId,
    toUserId: row.toUserId,
    amount: Money.fromMinor(row.amount, assertCurrency(row.currency)),
    status: row.status as TransactionStatus,
    failureReason: row.failureReason,
    createdAt: row.createdAt,
  })
}
