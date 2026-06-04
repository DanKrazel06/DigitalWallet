import { describe, expect, it, beforeEach } from 'vitest'
import { CreateChargeUseCase } from '../../src/application/create-charge.use-case.js'
import { CreateRefundUseCase } from '../../src/application/create-refund.use-case.js'
import {
  OriginalTransactionNotChargeError,
  OriginalTransactionNotCompletedError,
  OriginalTransactionNotFoundError,
} from '../../src/domain/errors.js'
import { createTestEnv, seedActiveWallet, seedMerchant, usd, uuid } from '../fakes/setup.js'

// CreateRefundUseCase tests — we always create a real charge first via
// the same in-memory env so the original transaction (and the ledger
// entries / balance changes) are realistic.

describe('CreateRefundUseCase', () => {
  const ALICE_MERCHANT = uuid(1)
  const ACME_MERCHANT = uuid(2)
  const ALICE_WALLET = uuid(10)
  const ACME_WALLET = uuid(20)

  // Helper: spin up an env with a successful 100 USD charge already
  // executed. Returns the env plus the original charge transaction id
  // so refund tests can target it.
  async function envWithCharge() {
    const env = createTestEnv()
    seedMerchant(env, ALICE_MERCHANT)
    seedMerchant(env, ACME_MERCHANT)
    seedActiveWallet(env, ALICE_WALLET, ALICE_MERCHANT, usd('1000'))
    seedActiveWallet(env, ACME_WALLET, ACME_MERCHANT, usd('0'))

    const charge = new CreateChargeUseCase(env.transactions, env.uow)
    const result = await charge.execute({
      clientRequestId: uuid(100),
      merchantId: ACME_MERCHANT,
      fromWalletId: ALICE_WALLET,
      toWalletId: ACME_WALLET,
      amount: '10000',
      currency: 'USD',
    })
    return { env, chargeId: result.transactionId }
  }

  it('reverses the charge: balances restored, refund ledger entries appended', async () => {
    const { env, chargeId } = await envWithCharge()
    const refund = new CreateRefundUseCase(env.transactions, env.uow)

    const result = await refund.execute({
      clientRequestId: uuid(200),
      merchantId: ACME_MERCHANT,
      originalTransactionId: chargeId,
      currency: 'USD',
      // omit amount → full refund
    })

    expect(result.status).toBe('completed')
    expect(result.originalTransactionId).toBe(chargeId)

    // Balances back to pre-charge state.
    const alice = await env.wallets.findById(ALICE_WALLET)
    const acme = await env.wallets.findById(ACME_WALLET)
    expect(alice?.balance.toMinorString()).toBe('100000') // 1000 USD
    expect(acme?.balance.toMinorString()).toBe('0')

    // 4 ledger entries total (2 charge + 2 refund).
    expect(env.ledger.all()).toHaveLength(4)
    // The 2 newest are refunds.
    const refundEntries = env.ledger.all().filter((e) => e.type === 'refund')
    expect(refundEntries).toHaveLength(2)

    // Both charge.completed and refund.completed in the outbox.
    expect(env.outbox.eventTypes()).toEqual(['charge.completed', 'refund.completed'])
  })

  it('idempotency: replaying the refund returns replayed=true and does not double-credit', async () => {
    const { env, chargeId } = await envWithCharge()
    const refund = new CreateRefundUseCase(env.transactions, env.uow)
    const key = uuid(200)

    const first = await refund.execute({
      clientRequestId: key,
      merchantId: ACME_MERCHANT,
      originalTransactionId: chargeId,
      currency: 'USD',
    })
    const second = await refund.execute({
      clientRequestId: key,
      merchantId: ACME_MERCHANT,
      originalTransactionId: chargeId,
      currency: 'USD',
    })

    expect(second.replayed).toBe(true)
    expect(second.transactionId).toBe(first.transactionId)

    // Alice not credited twice.
    const alice = await env.wallets.findById(ALICE_WALLET)
    expect(alice?.balance.toMinorString()).toBe('100000')
  })

  it('throws OriginalTransactionNotFoundError when the charge id does not exist', async () => {
    const { env } = await envWithCharge()
    const refund = new CreateRefundUseCase(env.transactions, env.uow)

    await expect(
      refund.execute({
        clientRequestId: uuid(200),
        merchantId: ACME_MERCHANT,
        originalTransactionId: uuid(999), // unknown
        currency: 'USD',
      }),
    ).rejects.toThrow(OriginalTransactionNotFoundError)
  })

  it('throws OriginalTransactionNotChargeError when referencing a refund as the original', async () => {
    const { env, chargeId } = await envWithCharge()
    const refund = new CreateRefundUseCase(env.transactions, env.uow)

    // First, a legitimate refund.
    const firstRefund = await refund.execute({
      clientRequestId: uuid(200),
      merchantId: ACME_MERCHANT,
      originalTransactionId: chargeId,
      currency: 'USD',
    })

    // Now try to refund THAT refund — should throw.
    await expect(
      refund.execute({
        clientRequestId: uuid(201),
        merchantId: ACME_MERCHANT,
        originalTransactionId: firstRefund.transactionId,
        currency: 'USD',
      }),
    ).rejects.toThrow(OriginalTransactionNotChargeError)
  })

  it('declines when refund amount exceeds the original charge amount', async () => {
    const { env, chargeId } = await envWithCharge()
    const refund = new CreateRefundUseCase(env.transactions, env.uow)

    const result = await refund.execute({
      clientRequestId: uuid(200),
      merchantId: ACME_MERCHANT,
      originalTransactionId: chargeId,
      amount: '20000', // 200 USD requested but original was 100
      currency: 'USD',
    })

    expect(result.status).toBe('declined')
    expect(result.declineReason).toContain('exceeds')

    // Balances unchanged from post-charge state.
    const alice = await env.wallets.findById(ALICE_WALLET)
    expect(alice?.balance.toMinorString()).toBe('90000')
    // No new ledger entries beyond the 2 charge ones.
    expect(env.ledger.all().filter((e) => e.type === 'refund')).toHaveLength(0)
  })

  // OriginalTransactionNotCompletedError is hard to trigger via the
  // public use-case API (declined transactions cannot become refund
  // targets in the current flow). We keep the import as a contract
  // pin in case a future use-case path exposes it.
  void OriginalTransactionNotCompletedError

  beforeEach(() => {
    // Reset is not needed because each `it` block uses its own env.
  })
})
