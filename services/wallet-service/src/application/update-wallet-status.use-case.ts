import { TOPICS, buildEnvelope } from '@walletdigital/events'
import { WalletNotFoundError } from '../domain/errors.js'
import type { UnitOfWork, WalletRepository } from '../domain/ports.js'
import type { UpdateWalletStatusInput } from './wallet.dto.js'

// UpdateWalletStatusUseCase — toggles a wallet between active and inactive.
// Publishes `wallet.status_changed` so transaction-service refreshes its
// projection and declines new charges/refunds involving an inactive wallet.
//
// Idempotent: no-op if the status is already the requested one.
export class UpdateWalletStatusUseCase {
  constructor(
    private readonly walletsRead: WalletRepository,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(input: UpdateWalletStatusInput): Promise<void> {
    const existing = await this.walletsRead.findById(input.id)
    if (existing === null) {
      throw new WalletNotFoundError()
    }
    if (existing.status === input.status) {
      return
    }

    await this.uow.withTransaction(async ({ wallets, outbox }) => {
      const inTx = await wallets.findById(input.id)
      if (inTx === null) {
        throw new WalletNotFoundError()
      }
      const updated = inTx.withStatus(input.status)
      await wallets.save(updated)
      await outbox.append({
        aggregateId: updated.id,
        topic: TOPICS.WALLET,
        payload: {
          ...buildEnvelope('wallet.status_changed'),
          payload: {
            walletId: updated.id,
            status: updated.status,
            changedAt: updated.updatedAt.toISOString(),
          },
        },
      })
    })
  }
}
