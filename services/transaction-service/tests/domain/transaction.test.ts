import { describe, expect, it } from 'vitest'
import { Money } from '../../src/domain/money.js'
import { Transaction } from '../../src/domain/transaction.js'
import { uuid } from '../fakes/setup.js'

const usd = (decimal: string) => Money.fromDecimal(decimal, 'USD')

describe('Transaction entity', () => {
  it('recordChargeCompleted produces a completed charge with no originalTransactionId', () => {
    const tx = Transaction.recordChargeCompleted({
      id: uuid(1),
      clientRequestId: uuid(2),
      merchantId: uuid(3),
      fromWalletId: uuid(4),
      toWalletId: uuid(5),
      amount: usd('100'),
    })

    expect(tx.type).toBe('charge')
    expect(tx.status).toBe('completed')
    expect(tx.declineReason).toBeNull()
    expect(tx.originalTransactionId).toBeNull()
    expect(tx.isCompleted()).toBe(true)
    expect(tx.isCharge()).toBe(true)
    expect(tx.isRefund()).toBe(false)
  })

  it('recordChargeDeclined produces a declined charge with the given reason', () => {
    const tx = Transaction.recordChargeDeclined({
      id: uuid(1),
      clientRequestId: uuid(2),
      merchantId: uuid(3),
      fromWalletId: uuid(4),
      toWalletId: uuid(5),
      amount: usd('100'),
      reason: 'Insufficient funds',
    })

    expect(tx.status).toBe('declined')
    expect(tx.declineReason).toBe('Insufficient funds')
    expect(tx.isCompleted()).toBe(false)
  })

  it('recordRefundCompleted links to the original via originalTransactionId', () => {
    const originalId = uuid(99)
    const tx = Transaction.recordRefundCompleted({
      id: uuid(1),
      clientRequestId: uuid(2),
      originalTransactionId: originalId,
      merchantId: uuid(3),
      fromWalletId: uuid(4),
      toWalletId: uuid(5),
      amount: usd('100'),
    })

    expect(tx.type).toBe('refund')
    expect(tx.status).toBe('completed')
    expect(tx.originalTransactionId).toBe(originalId)
    expect(tx.isRefund()).toBe(true)
  })

  it('toSnapshot returns flat values in minor units', () => {
    const tx = Transaction.recordChargeCompleted({
      id: uuid(1),
      clientRequestId: uuid(2),
      merchantId: uuid(3),
      fromWalletId: uuid(4),
      toWalletId: uuid(5),
      amount: usd('12.34'),
    })

    const snap = tx.toSnapshot()
    expect(snap.amount).toBe(1234n)
    expect(snap.currency).toBe('USD')
    expect(snap.status).toBe('completed')
  })

  it('rehydrate restores all fields exactly as stored', () => {
    const original = Transaction.recordChargeCompleted({
      id: uuid(1),
      clientRequestId: uuid(2),
      merchantId: uuid(3),
      fromWalletId: uuid(4),
      toWalletId: uuid(5),
      amount: usd('42.50'),
    })
    const snap = original.toSnapshot()

    const rehydrated = Transaction.rehydrate({
      id: snap.id,
      type: snap.type,
      clientRequestId: snap.clientRequestId,
      originalTransactionId: snap.originalTransactionId,
      merchantId: snap.merchantId,
      fromWalletId: snap.fromWalletId,
      toWalletId: snap.toWalletId,
      amount: Money.fromMinor(snap.amount, 'USD'),
      status: snap.status,
      declineReason: snap.declineReason,
      createdAt: snap.createdAt,
    })

    expect(rehydrated.id).toBe(original.id)
    expect(rehydrated.amount.toMinorString()).toBe(original.amount.toMinorString())
    expect(rehydrated.createdAt.toISOString()).toBe(original.createdAt.toISOString())
  })
})
