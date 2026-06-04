import type { Kafka } from 'kafkajs'
import type { Logger } from '@walletdigital/logger'
import { TOPICS, walletEventSchema, type WalletEvent } from '@walletdigital/events'
import { createEventConsumer, type EventConsumer } from '@walletdigital/kafka'
import type {
  ProjectWalletFromCreatedUseCase,
  ProjectWalletStatusUseCase,
} from '../application/project-wallet.use-case.js'

// WalletEventConsumer — subscribes to `walletdigital.wallet` and keeps
// transaction-service's local wallet projection in sync.
//   - `wallet.created`         → INSERT projection row
//   - `wallet.status_changed`  → UPDATE projection status
//
// Both use-cases are idempotent so redeliveries are safe.
export interface WalletEventConsumerOptions {
  kafka: Kafka
  logger: Logger
  groupId: string
  projectWallet: ProjectWalletFromCreatedUseCase
  projectWalletStatus: ProjectWalletStatusUseCase
}

export async function createWalletEventConsumer(options: WalletEventConsumerOptions): Promise<EventConsumer> {
  const { kafka, logger, groupId, projectWallet, projectWalletStatus } = options

  return createEventConsumer({
    kafka,
    logger,
    groupId,
    subscription: {
      topic: TOPICS.WALLET,
      schema: walletEventSchema,
      handler: async (event: WalletEvent) => {
        switch (event.type) {
          case 'wallet.created': {
            const { walletId, merchantId, currency, balance } = event.payload
            const result = await projectWallet.execute({
              walletId,
              merchantId,
              currency,
              balance,
            })
            if (result.created) {
              logger.info({ walletId, merchantId }, 'wallet projection inserted from wallet.created event')
            } else {
              logger.debug({ walletId, merchantId }, 'wallet projection already existed — skipped')
            }
            return
          }
          case 'wallet.status_changed': {
            const { walletId, status } = event.payload
            const result = await projectWalletStatus.execute({ walletId, status })
            if (result.updated) {
              logger.info({ walletId, status }, 'wallet projection status updated from wallet.status_changed event')
            } else {
              logger.debug({ walletId, status }, 'wallet projection status update was a no-op')
            }
            return
          }
        }
      },
    },
  })
}
