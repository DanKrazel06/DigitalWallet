import { TOPICS, buildEnvelope } from '@walletdigital/events'
import { Merchant } from '../domain/merchant.js'
import type { UnitOfWork } from '../domain/ports.js'
import type { CreateMerchantInput, CreateMerchantOutput } from './create-merchant.dto.js'

// CreateMerchantUseCase — registers a new merchant identity.
//
// Persists the merchant row AND a `merchant.created` outbox event in the
// SAME transaction. wallet-service consumes that event and auto-creates
// the wallet attached to this merchant.
export class CreateMerchantUseCase {
  constructor(private readonly uow: UnitOfWork) {}

  async execute(input: CreateMerchantInput): Promise<CreateMerchantOutput> {
    const merchant = Merchant.create({
      id: crypto.randomUUID(),
      name: input.name.trim(),
      type: input.type,
    })

    await this.uow.withTransaction(async ({ merchants, outbox }) => {
      await merchants.save(merchant)
      await outbox.append({
        aggregateId: merchant.id,
        topic: TOPICS.MERCHANT,
        payload: {
          ...buildEnvelope('merchant.created'),
          payload: {
            merchantId: merchant.id,
            name: merchant.name,
            type: merchant.type,
            createdAt: merchant.createdAt.toISOString(),
          },
        },
      })
    })

    return {
      merchantId: merchant.id,
      name: merchant.name,
      type: merchant.type,
      createdAt: merchant.createdAt.toISOString(),
    }
  }
}
