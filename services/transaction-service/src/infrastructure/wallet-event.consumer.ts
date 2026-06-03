import type { Kafka } from 'kafkajs'
import type { Logger } from '@walletdigital/logger'
import { TOPICS, walletEventSchema, type WalletEvent } from '@walletdigital/events'
import { createEventConsumer, type EventConsumer } from '@walletdigital/kafka'
import type { ProjectWalletFromCreatedUseCase } from '../application/project-wallet.use-case.js'

// WalletEventConsumer — subscribes to `walletdigital.wallet` and keeps
// transaction-service's local wallet projection in sync.
//
// Only `wallet.created` triggers work today: a brand-new wallet must
// appear in our projection table before any transfer to/from it can
// happen. The use-case is idempotent so redeliveries are safe.
export interface WalletEventConsumerOptions {
  kafka: Kafka
  logger: Logger
  groupId: string
  projectWallet: ProjectWalletFromCreatedUseCase
}

export async function createWalletEventConsumer(
  options: WalletEventConsumerOptions,
): Promise<EventConsumer> {
  const { kafka, logger, groupId, projectWallet } = options

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
            const { walletId, userId, currency, balance } = event.payload
            const result = await projectWallet.execute({
              walletId,
              userId,
              currency,
              balance,
            })
            if (result.created) {
              logger.info(
                { walletId, userId },
                'wallet projection inserted from wallet.created event',
              )
            } else {
              logger.debug(
                { walletId, userId },
                'wallet projection already existed — skipped',
              )
            }
            return
          }
        }
      },
    },
  })
}
