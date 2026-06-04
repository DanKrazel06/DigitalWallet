import { describe, expect, it } from 'vitest'
import { CreateChargeUseCase } from '../../src/application/create-charge.use-case.js'
import {
  MerchantInactiveError,
  MerchantNotFoundError,
  WalletInactiveError,
  WalletNotFoundError,
} from '../../src/domain/errors.js'
import { createTestEnv, seedActiveWallet, seedMerchant, usd, uuid } from '../fakes/setup.js'

// CreateChargeUseCase tests — pure domain logic via in-memory fakes.
// No DB, no Kafka, no Docker. Each `it` block is < 5ms.

describe('CreateChargeUseCase', () => {
  // Common identifiers reused across tests. uuid(n) gives stable values
  // so assertions can compare exact references when needed.
  const ALICE_MERCHANT = uuid(1)
  const ACME_MERCHANT = uuid(2)
  const ALICE_WALLET = uuid(10)
  const ACME_WALLET = uuid(20)
  const CLIENT_REQ_ID = uuid(100)

  function makeEnvWithActors(aliceStart: string = '1000') {
    const env = createTestEnv()
    seedMerchant(env, ALICE_MERCHANT)
    seedMerchant(env, ACME_MERCHANT)
    seedActiveWallet(env, ALICE_WALLET, ALICE_MERCHANT, usd(aliceStart))
    seedActiveWallet(env, ACME_WALLET, ACME_MERCHANT, usd('0'))
    return env
  }

  it('debits source, credits destination, writes 2 ledger entries, emits charge.completed', async () => {
    const env = makeEnvWithActors()
    const useCase = new CreateChargeUseCase(env.transactions, env.uow)

    const result = await useCase.execute({
      clientRequestId: CLIENT_REQ_ID,
      merchantId: ACME_MERCHANT,
      fromWalletId: ALICE_WALLET,
      toWalletId: ACME_WALLET,
      amount: '10000', // 100 USD in minor units
      currency: 'USD',
    })

    expect(result.status).toBe('completed')
    expect(result.declineReason).toBeNull()
    expect(result.replayed).toBe(false)

    // Balances updated atomically.
    const alice = await env.wallets.findById(ALICE_WALLET)
    const acme = await env.wallets.findById(ACME_WALLET)
    expect(alice?.balance.toMinorString()).toBe('90000')
    expect(acme?.balance.toMinorString()).toBe('10000')

    // One transaction persisted with status completed.
    const txs = env.transactions.all()
    expect(txs).toHaveLength(1)
    expect(txs[0]?.status).toBe('completed')
    expect(txs[0]?.type).toBe('charge')

    // Two ledger entries summing to zero (double-entry invariant).
    const ledger = env.ledger.all()
    expect(ledger).toHaveLength(2)
    const totalDebit = ledger.reduce((s, e) => s + e.debit.amount, 0n)
    const totalCredit = ledger.reduce((s, e) => s + e.credit.amount, 0n)
    expect(totalDebit).toBe(totalCredit)

    // charge.completed event was queued in the outbox.
    expect(env.outbox.eventTypes()).toEqual(['charge.completed'])
  })

  it('idempotency: second call with the same clientRequestId returns replayed=true', async () => {
    const env = makeEnvWithActors()
    const useCase = new CreateChargeUseCase(env.transactions, env.uow)

    const first = await useCase.execute({
      clientRequestId: CLIENT_REQ_ID,
      merchantId: ACME_MERCHANT,
      fromWalletId: ALICE_WALLET,
      toWalletId: ACME_WALLET,
      amount: '10000',
      currency: 'USD',
    })

    const second = await useCase.execute({
      clientRequestId: CLIENT_REQ_ID,
      merchantId: ACME_MERCHANT,
      fromWalletId: ALICE_WALLET,
      toWalletId: ACME_WALLET,
      amount: '10000',
      currency: 'USD',
    })

    expect(second.replayed).toBe(true)
    expect(second.transactionId).toBe(first.transactionId)

    // Critically, the second call did NOT debit Alice again.
    const alice = await env.wallets.findById(ALICE_WALLET)
    expect(alice?.balance.toMinorString()).toBe('90000')

    // Only one ledger pair.
    expect(env.ledger.all()).toHaveLength(2)
  })

  it('declines with INSUFFICIENT_FUNDS when source balance < amount', async () => {
    const env = makeEnvWithActors('50') // Alice only has 50 USD
    const useCase = new CreateChargeUseCase(env.transactions, env.uow)

    const result = await useCase.execute({
      clientRequestId: CLIENT_REQ_ID,
      merchantId: ACME_MERCHANT,
      fromWalletId: ALICE_WALLET,
      toWalletId: ACME_WALLET,
      amount: '10000', // 100 USD requested
      currency: 'USD',
    })

    expect(result.status).toBe('declined')
    expect(result.declineReason).toContain('Insufficient funds')

    // Balances UNCHANGED.
    const alice = await env.wallets.findById(ALICE_WALLET)
    const acme = await env.wallets.findById(ACME_WALLET)
    expect(alice?.balance.toMinorString()).toBe('5000')
    expect(acme?.balance.toMinorString()).toBe('0')

    // No ledger entries for a declined transaction.
    expect(env.ledger.all()).toHaveLength(0)

    // But the transaction row is persisted (for audit and idempotency).
    expect(env.transactions.all()).toHaveLength(1)
    expect(env.transactions.all()[0]?.status).toBe('declined')

    // Decline event emitted.
    expect(env.outbox.eventTypes()).toEqual(['charge.declined'])
  })

  it('declines with MERCHANT_INACTIVE when the merchant is inactive', async () => {
    const env = makeEnvWithActors()
    const acme = await env.merchants.findById(ACME_MERCHANT)
    env.merchants.seed(acme!.withStatus('inactive'))

    const useCase = new CreateChargeUseCase(env.transactions, env.uow)
    const result = await useCase.execute({
      clientRequestId: CLIENT_REQ_ID,
      merchantId: ACME_MERCHANT,
      fromWalletId: ALICE_WALLET,
      toWalletId: ACME_WALLET,
      amount: '10000',
      currency: 'USD',
    })

    expect(result.status).toBe('declined')
    expect(result.declineReason).toContain('not active')
    expect(env.ledger.all()).toHaveLength(0)
  })

  it('declines with WALLET_INACTIVE when source wallet is inactive', async () => {
    const env = makeEnvWithActors()
    const alice = await env.wallets.findById(ALICE_WALLET)
    env.wallets.seed(alice!.withStatus('inactive'))

    const useCase = new CreateChargeUseCase(env.transactions, env.uow)
    const result = await useCase.execute({
      clientRequestId: CLIENT_REQ_ID,
      merchantId: ACME_MERCHANT,
      fromWalletId: ALICE_WALLET,
      toWalletId: ACME_WALLET,
      amount: '10000',
      currency: 'USD',
    })

    expect(result.status).toBe('declined')
    expect(result.declineReason).toContain('not active')
    expect(env.ledger.all()).toHaveLength(0)
  })

  it('declines with SAME_WALLET_TRANSFER when source equals destination', async () => {
    const env = makeEnvWithActors()
    const useCase = new CreateChargeUseCase(env.transactions, env.uow)

    const result = await useCase.execute({
      clientRequestId: CLIENT_REQ_ID,
      merchantId: ACME_MERCHANT,
      fromWalletId: ALICE_WALLET,
      toWalletId: ALICE_WALLET, // same!
      amount: '10000',
      currency: 'USD',
    })

    expect(result.status).toBe('declined')
    expect(result.declineReason).toContain('differ')
    expect(env.ledger.all()).toHaveLength(0)
  })

  it('throws MerchantNotFoundError when merchant id is unknown', async () => {
    const env = makeEnvWithActors()
    const useCase = new CreateChargeUseCase(env.transactions, env.uow)

    await expect(
      useCase.execute({
        clientRequestId: CLIENT_REQ_ID,
        merchantId: uuid(999), // not seeded
        fromWalletId: ALICE_WALLET,
        toWalletId: ACME_WALLET,
        amount: '10000',
        currency: 'USD',
      }),
    ).rejects.toThrow(MerchantNotFoundError)
  })

  it('throws WalletNotFoundError when source wallet is unknown', async () => {
    const env = makeEnvWithActors()
    const useCase = new CreateChargeUseCase(env.transactions, env.uow)

    await expect(
      useCase.execute({
        clientRequestId: CLIENT_REQ_ID,
        merchantId: ACME_MERCHANT,
        fromWalletId: uuid(998),
        toWalletId: ACME_WALLET,
        amount: '10000',
        currency: 'USD',
      }),
    ).rejects.toThrow(WalletNotFoundError)
  })

  it('throws WalletNotFoundError when destination wallet is unknown', async () => {
    const env = makeEnvWithActors()
    const useCase = new CreateChargeUseCase(env.transactions, env.uow)

    await expect(
      useCase.execute({
        clientRequestId: CLIENT_REQ_ID,
        merchantId: ACME_MERCHANT,
        fromWalletId: ALICE_WALLET,
        toWalletId: uuid(997),
        amount: '10000',
        currency: 'USD',
      }),
    ).rejects.toThrow(WalletNotFoundError)
  })

  // Suppress unused-import warning — these symbols are part of the
  // public contract we want to lock in even if not all tests use them.
  void MerchantInactiveError
  void WalletInactiveError
})
