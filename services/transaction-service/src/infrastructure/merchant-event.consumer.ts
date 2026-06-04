import type { Kafka } from 'kafkajs'
import type { Logger } from '@walletdigital/logger'
import { TOPICS, merchantEventSchema, type MerchantEvent } from '@walletdigital/events'
import { createEventConsumer, type EventConsumer } from '@walletdigital/kafka'
import type {
  ProjectMerchantFromCreatedUseCase,
  ProjectMerchantStatusUseCase,
} from '../application/project-merchant.use-case.js'

// MerchantEventConsumer — subscribes to `walletdigital.merchant` and
// keeps transaction-service's local merchant projection in sync.
//   - `merchant.created`         → INSERT projection row (status=active)
//   - `merchant.status_changed`  → UPDATE projection status
//
// Both use-cases are idempotent so redeliveries are safe.
export interface MerchantEventConsumerOptions {
  kafka: Kafka
  logger: Logger
  groupId: string
  projectMerchant: ProjectMerchantFromCreatedUseCase
  projectMerchantStatus: ProjectMerchantStatusUseCase
}

export async function createMerchantEventConsumer(options: MerchantEventConsumerOptions): Promise<EventConsumer> {
  const { kafka, logger, groupId, projectMerchant, projectMerchantStatus } = options

  return createEventConsumer({
    kafka,
    logger,
    groupId,
    subscription: {
      topic: TOPICS.MERCHANT,
      schema: merchantEventSchema,
      handler: async (event: MerchantEvent) => {
        switch (event.type) {
          case 'merchant.created': {
            const result = await projectMerchant.execute({
              merchantId: event.payload.merchantId,
            })
            if (result.created) {
              logger.info(
                { merchantId: event.payload.merchantId },
                'merchant projection inserted from merchant.created event',
              )
            } else {
              logger.debug({ merchantId: event.payload.merchantId }, 'merchant projection already existed — skipped')
            }
            return
          }
          case 'merchant.status_changed': {
            const result = await projectMerchantStatus.execute({
              merchantId: event.payload.merchantId,
              status: event.payload.status,
            })
            if (result.updated) {
              logger.info(
                {
                  merchantId: event.payload.merchantId,
                  status: event.payload.status,
                },
                'merchant projection status updated from merchant.status_changed event',
              )
            } else {
              logger.debug(
                {
                  merchantId: event.payload.merchantId,
                  status: event.payload.status,
                },
                'merchant projection status update was a no-op',
              )
            }
            return
          }
        }
      },
    },
  })
}
