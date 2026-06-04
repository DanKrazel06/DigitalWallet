import { Money } from '../../src/domain/money.js'
import { MerchantProjection } from '../../src/domain/merchant-projection.js'
import { WalletProjection } from '../../src/domain/wallet-projection.js'
import { InMemoryWalletProjectionRepository } from './in-memory-wallet-projection.repository.js'
import { InMemoryMerchantProjectionRepository } from './in-memory-merchant-projection.repository.js'
import { InMemoryTransactionRepository } from './in-memory-transaction.repository.js'
import { InMemoryLedgerRepository } from './in-memory-ledger.repository.js'
import { InMemoryOutboxWriter } from './in-memory-outbox.writer.js'
import { InMemoryUnitOfWork } from './in-memory-unit-of-work.js'

// Test setup factory — instantiates every in-memory dependency a use-case
// might need and returns them grouped, so tests can write
//   `const { uow, wallets, ... } = createTestEnv()`
// instead of new'ing six fakes manually each time.
export function createTestEnv() {
  const wallets = new InMemoryWalletProjectionRepository()
  const merchants = new InMemoryMerchantProjectionRepository()
  const transactions = new InMemoryTransactionRepository()
  const ledger = new InMemoryLedgerRepository()
  const outbox = new InMemoryOutboxWriter()
  const uow = new InMemoryUnitOfWork(wallets, merchants, transactions, ledger, outbox)

  return { wallets, merchants, transactions, ledger, outbox, uow }
}

// usd — short factory for Money.fromDecimal in USD. Lets tests write
// `usd('100')` instead of `Money.fromDecimal('100', 'USD')`.
export function usd(decimal: string): Money {
  return Money.fromDecimal(decimal, 'USD')
}

// Seed helpers — produce a merchant + wallet pair ready to use.
export function seedMerchant(env: ReturnType<typeof createTestEnv>, id: string): MerchantProjection {
  const m = MerchantProjection.fromCreatedEvent({ id })
  env.merchants.seed(m)
  return m
}

export function seedActiveWallet(
  env: ReturnType<typeof createTestEnv>,
  id: string,
  merchantId: string,
  startingBalance: Money,
): WalletProjection {
  const w = WalletProjection.fromCreatedEvent({
    id,
    merchantId,
    balance: startingBalance,
  })
  env.wallets.seed(w)
  return w
}

// Predictable UUID generator for tests. Avoids the randomness of
// `crypto.randomUUID()` so test assertions can compare against fixed values.
export function uuid(seed: number): string {
  const hex = seed.toString(16).padStart(12, '0')
  return `00000000-0000-4000-8000-${hex}`
}
