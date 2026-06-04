import { TOPICS, buildEnvelope } from '@walletdigital/events'
import { MerchantNotFoundError } from '../domain/errors.js'
import type { UnitOfWork, MerchantRepository } from '../domain/ports.js'
import type { UpdateMerchantStatusInput } from './merchant.dto.js'

// UpdateMerchantStatusUseCase — toggles a merchant between active and
// inactive. Publishes `merchant.status_changed` so downstream services
// (transaction-service notably) refresh their projections and decline
// future operations involving an inactive merchant.
export class UpdateMerchantStatusUseCase {
  constructor(
    private readonly merchantsRead: MerchantRepository,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(input: UpdateMerchantStatusInput): Promise<void> {
    // Pre-flight check outside the transaction. The transactional path
    // re-loads the row inside the tx to avoid TOCTOU on the status.
    const existing = await this.merchantsRead.findById(input.id)
    if (existing === null) {
      throw new MerchantNotFoundError()
    }
    // Short-circuit: idempotent if the status is already correct.
    if (existing.status === input.status) {
      return
    }

    await this.uow.withTransaction(async ({ merchants, outbox }) => {
      const inTx = await merchants.findById(input.id)
      if (inTx === null) {
        throw new MerchantNotFoundError()
      }
      const updated = inTx.withStatus(input.status)
      await merchants.save(updated)
      await outbox.append({
        aggregateId: updated.id,
        topic: TOPICS.MERCHANT,
        payload: {
          ...buildEnvelope('merchant.status_changed'),
          payload: {
            merchantId: updated.id,
            status: updated.status,
            changedAt: updated.updatedAt.toISOString(),
          },
        },
      })
    })
  }
}
