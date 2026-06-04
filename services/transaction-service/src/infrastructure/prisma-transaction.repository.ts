import { Money, assertCurrency } from '../domain/money.js'
import { Transaction, type TransactionStatus, type TransactionType } from '../domain/transaction.js'
import type { TransactionRepository } from '../domain/ports.js'
import type { PrismaLike } from './prisma-types.js'

// PrismaTransactionRepository — concrete implementation of TransactionRepository.
//
// `amount` is Decimal(20, 4) in Postgres; we convert via Money at the
// boundary so the domain only ever manipulates bigint minor units.
export class PrismaTransactionRepository implements TransactionRepository {
  constructor(private readonly prisma: PrismaLike) {}

  async findById(id: string): Promise<Transaction | null> {
    const row = await this.prisma.transaction.findUnique({ where: { id } })
    return row === null ? null : this.toDomain(row)
  }

  async findByClientRequestId(clientRequestId: string): Promise<Transaction | null> {
    const row = await this.prisma.transaction.findUnique({ where: { clientRequestId } })
    return row === null ? null : this.toDomain(row)
  }

  async listByMerchantId(merchantId: string, limit: number, offset: number): Promise<Transaction[]> {
    const rows = await this.prisma.transaction.findMany({
      where: { merchantId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    })
    return rows.map((row) => this.toDomain(row))
  }

  async insert(transaction: Transaction): Promise<void> {
    const snap = transaction.toSnapshot()
    await this.prisma.transaction.create({
      data: {
        id: snap.id,
        type: snap.type,
        clientRequestId: snap.clientRequestId,
        originalTransactionId: snap.originalTransactionId,
        merchantId: snap.merchantId,
        fromWalletId: snap.fromWalletId,
        toWalletId: snap.toWalletId,
        amount: transaction.amount.toDecimalString(),
        currency: snap.currency,
        status: snap.status,
        declineReason: snap.declineReason,
        createdAt: snap.createdAt,
      },
    })
  }

  private toDomain(row: {
    id: string
    type: string
    clientRequestId: string
    originalTransactionId: string | null
    merchantId: string
    fromWalletId: string
    toWalletId: string
    amount: { toString(): string }
    currency: string
    status: string
    declineReason: string | null
    createdAt: Date
  }): Transaction {
    const currency = assertCurrency(row.currency)
    return Transaction.rehydrate({
      id: row.id,
      type: row.type as TransactionType,
      clientRequestId: row.clientRequestId,
      originalTransactionId: row.originalTransactionId,
      merchantId: row.merchantId,
      fromWalletId: row.fromWalletId,
      toWalletId: row.toWalletId,
      amount: Money.fromDecimalString(row.amount.toString(), currency),
      status: row.status as TransactionStatus,
      declineReason: row.declineReason,
      createdAt: row.createdAt,
    })
  }
}
