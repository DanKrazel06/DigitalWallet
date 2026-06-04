import { describe, expect, it } from 'vitest'
import { LedgerEntry } from '../../src/domain/ledger-entry.js'
import { Money } from '../../src/domain/money.js'
import { uuid } from '../fakes/setup.js'

const usd = (decimal: string) => Money.fromDecimal(decimal, 'USD')

describe('LedgerEntry entity', () => {
  it('chargeDebit produces a debit-only entry of type=charge', () => {
    const e = LedgerEntry.chargeDebit({
      id: uuid(1),
      transactionId: uuid(2),
      walletId: uuid(3),
      amount: usd('50'),
      balanceAfter: usd('100'),
    })

    expect(e.type).toBe('charge')
    expect(e.debit.toMinorString()).toBe('5000')
    expect(e.credit.toMinorString()).toBe('0')
    expect(e.balanceAfter.toMinorString()).toBe('10000')
  })

  it('chargeCredit produces a credit-only entry of type=charge', () => {
    const e = LedgerEntry.chargeCredit({
      id: uuid(1),
      transactionId: uuid(2),
      walletId: uuid(3),
      amount: usd('50'),
      balanceAfter: usd('100'),
    })

    expect(e.type).toBe('charge')
    expect(e.debit.toMinorString()).toBe('0')
    expect(e.credit.toMinorString()).toBe('5000')
  })

  it('refundDebit and refundCredit produce entries of type=refund', () => {
    const debit = LedgerEntry.refundDebit({
      id: uuid(1),
      transactionId: uuid(2),
      walletId: uuid(3),
      amount: usd('50'),
      balanceAfter: usd('0'),
    })
    const credit = LedgerEntry.refundCredit({
      id: uuid(4),
      transactionId: uuid(2),
      walletId: uuid(5),
      amount: usd('50'),
      balanceAfter: usd('100'),
    })

    expect(debit.type).toBe('refund')
    expect(credit.type).toBe('refund')
  })

  // Double-entry invariant — the heart of accounting integrity.
  it('a (debit, credit) pair always sums to zero in the same currency', () => {
    const debit = LedgerEntry.chargeDebit({
      id: uuid(1),
      transactionId: uuid(2),
      walletId: uuid(3),
      amount: usd('100'),
      balanceAfter: usd('900'),
    })
    const credit = LedgerEntry.chargeCredit({
      id: uuid(4),
      transactionId: uuid(2),
      walletId: uuid(5),
      amount: usd('100'),
      balanceAfter: usd('100'),
    })

    const totalDebit = debit.debit.amount + credit.debit.amount
    const totalCredit = debit.credit.amount + credit.credit.amount
    expect(totalDebit).toBe(totalCredit)
  })
})
