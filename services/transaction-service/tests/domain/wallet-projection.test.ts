import { describe, expect, it } from 'vitest'
import { Money } from '../../src/domain/money.js'
import { WalletProjection } from '../../src/domain/wallet-projection.js'
import { uuid } from '../fakes/setup.js'

const usd = (decimal: string) => Money.fromDecimal(decimal, 'USD')

describe('WalletProjection entity', () => {
  function make(balance: string = '1000'): WalletProjection {
    return WalletProjection.fromCreatedEvent({
      id: uuid(1),
      merchantId: uuid(2),
      balance: usd(balance),
    })
  }

  it('starts active and with the given balance', () => {
    const w = make('1000')
    expect(w.status).toBe('active')
    expect(w.isActive()).toBe(true)
    expect(w.balance.toMinorString()).toBe('100000')
  })

  it('applyDebit returns a NEW projection with reduced balance (original unchanged)', () => {
    const before = make('1000')
    const after = before.applyDebit(usd('100'))

    expect(after.balance.toMinorString()).toBe('90000')
    expect(before.balance.toMinorString()).toBe('100000')
  })

  it('applyDebit throws when the resulting balance would go negative', () => {
    const w = make('50')
    expect(() => w.applyDebit(usd('100'))).toThrow(/negative/)
  })

  it('applyCredit increases the balance', () => {
    const before = make('0')
    const after = before.applyCredit(usd('250'))
    expect(after.balance.toMinorString()).toBe('25000')
  })

  it('withStatus toggles to inactive and back, immutably', () => {
    const active = make('100')
    const inactive = active.withStatus('inactive')

    expect(inactive.isActive()).toBe(false)
    expect(active.isActive()).toBe(true) // original unchanged
  })

  it('toSnapshot exposes raw bigint balance + currency', () => {
    const w = make('42.50')
    const snap = w.toSnapshot()
    expect(snap.balance).toBe(4250n)
    expect(snap.currency).toBe('USD')
  })
})
