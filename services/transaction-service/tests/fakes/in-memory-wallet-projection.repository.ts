import type { WalletProjection } from '../../src/domain/wallet-projection.js'
import type { WalletProjectionRepository } from '../../src/domain/ports.js'

// InMemoryWalletProjectionRepository — fake repository for unit tests.
// Uses a plain Map keyed by wallet id. `findForUpdateById` returns the
// same entity as findById — there is no concurrent access in unit tests
// so the lock semantics are irrelevant.
export class InMemoryWalletProjectionRepository implements WalletProjectionRepository {
  private readonly byId = new Map<string, WalletProjection>()

  // Test helper: seed the repository with a wallet.
  seed(wallet: WalletProjection): void {
    this.byId.set(wallet.id, wallet)
  }

  async findById(id: string): Promise<WalletProjection | null> {
    return this.byId.get(id) ?? null
  }

  async findByMerchantId(merchantId: string): Promise<WalletProjection | null> {
    for (const w of this.byId.values()) {
      if (w.merchantId === merchantId) return w
    }
    return null
  }

  async findForUpdateById(id: string): Promise<WalletProjection | null> {
    return this.findById(id)
  }

  async insert(wallet: WalletProjection): Promise<void> {
    if (this.byId.has(wallet.id)) {
      // Mimic Prisma's P2002 unique-violation shape so use-cases'
      // isUniqueViolation checks still trigger in tests.
      throw Object.assign(new Error('unique violation'), { code: 'P2002' })
    }
    this.byId.set(wallet.id, wallet)
  }

  async update(wallet: WalletProjection): Promise<void> {
    this.byId.set(wallet.id, wallet)
  }
}
