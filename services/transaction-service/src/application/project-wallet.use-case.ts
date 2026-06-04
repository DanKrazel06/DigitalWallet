import { Money } from '../domain/money.js'
import { WalletProjection } from '../domain/wallet-projection.js'
import type { WalletProjectionRepository } from '../domain/ports.js'
import type { ProjectWalletFromCreatedInput, ProjectWalletStatusInput } from './project-wallet.dto.js'

// ProjectWalletFromCreatedUseCase — consumes a `wallet.created` event
// and INSERTs the matching row in transaction-service's local projection.
//
// Idempotent: at-least-once delivery means events may be redelivered.
// findById short-circuits when the row already exists; the unique
// constraint on `id` catches concurrent inserts as a safety net.
export class ProjectWalletFromCreatedUseCase {
  constructor(private readonly wallets: WalletProjectionRepository) {}

  async execute(input: ProjectWalletFromCreatedInput): Promise<{ created: boolean }> {
    const existing = await this.wallets.findById(input.walletId)
    if (existing !== null) {
      return { created: false }
    }

    const projection = WalletProjection.fromCreatedEvent({
      id: input.walletId,
      merchantId: input.merchantId,
      balance: Money.fromMinor(BigInt(input.balance), input.currency),
    })

    try {
      await this.wallets.insert(projection)
    } catch (err) {
      if (isUniqueViolation(err)) {
        return { created: false }
      }
      throw err
    }

    return { created: true }
  }
}

// ProjectWalletStatusUseCase — consumes `wallet.status_changed`.
// Idempotent: no-op if status is already correct or row missing.
export class ProjectWalletStatusUseCase {
  constructor(private readonly wallets: WalletProjectionRepository) {}

  async execute(input: ProjectWalletStatusInput): Promise<{ updated: boolean }> {
    const existing = await this.wallets.findById(input.walletId)
    if (existing === null) {
      // Event arrived before the wallet.created event. Drop — the
      // wallet.created consumer will see the correct status when it
      // eventually catches up.
      return { updated: false }
    }
    if (existing.status === input.status) {
      return { updated: false }
    }
    await this.wallets.update(existing.withStatus(input.status))
    return { updated: true }
  }
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && (err as { code: unknown }).code === 'P2002'
}
