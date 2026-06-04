import { MerchantProjection } from '../domain/merchant-projection.js'
import type { MerchantProjectionRepository } from '../domain/ports.js'
import type { ProjectMerchantFromCreatedInput, ProjectMerchantStatusInput } from './project-merchant.dto.js'

// ProjectMerchantFromCreatedUseCase — maintains the local merchant
// projection in reaction to `merchant.created` events from
// merchant-service.
//
// Why we project: when a client posts a charge or a refund, this
// service must check "is the initiating merchant active?" without an
// HTTP call to merchant-service. We mirror just `id` and `status`
// locally so the check happens inside the same Postgres transaction as
// the wallet locking + ledger writes (fast, atomic, no network call).
//
// Idempotent: at-least-once Kafka delivery means events may be
// redelivered. `findById` short-circuits when the row exists; the
// unique constraint on `id` catches concurrent inserts as a safety net.
export class ProjectMerchantFromCreatedUseCase {
  constructor(private readonly merchants: MerchantProjectionRepository) {}

  async execute(input: ProjectMerchantFromCreatedInput): Promise<{ created: boolean }> {
    const existing = await this.merchants.findById(input.merchantId)
    if (existing !== null) {
      return { created: false }
    }

    const projection = MerchantProjection.fromCreatedEvent({ id: input.merchantId })

    try {
      await this.merchants.insert(projection)
    } catch (err) {
      if (isUniqueViolation(err)) {
        return { created: false }
      }
      throw err
    }

    return { created: true }
  }
}

// ProjectMerchantStatusUseCase — mirrors `merchant.status_changed` onto
// the local projection. Idempotent: no-op when the status already
// matches or when the merchant row hasn't been projected yet (event
// reordering — the next `merchant.created` consumer will create it with
// the eventually-consistent status).
export class ProjectMerchantStatusUseCase {
  constructor(private readonly merchants: MerchantProjectionRepository) {}

  async execute(input: ProjectMerchantStatusInput): Promise<{ updated: boolean }> {
    const existing = await this.merchants.findById(input.merchantId)
    if (existing === null) {
      // Event arrived before merchant.created. Drop silently — the
      // create consumer will write the correct state once it catches up.
      return { updated: false }
    }
    if (existing.status === input.status) {
      return { updated: false }
    }
    await this.merchants.update(existing.withStatus(input.status))
    return { updated: true }
  }
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && (err as { code: unknown }).code === 'P2002'
}
