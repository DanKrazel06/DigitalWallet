import type { Kafka } from 'kafkajs'
import type { Logger } from '@walletdigital/logger'
import { TOPICS, transactionEventSchema, type TransactionEvent } from '@walletdigital/events'
import { createEventConsumer, type EventConsumer } from '@walletdigital/kafka'
import type { ApplyTransactionToWalletsUseCase } from '../application/apply-transaction.use-case.js'

// TransactionEventConsumer — subscribes to `walletdigital.transaction`
// and mirrors balance changes onto the local wallets.
//
// Only `charge.completed` and `refund.completed` trigger work — declined
// events do not move money, so we acknowledge them silently. The
// use-case is the same for both: from -> to in the event payload.
export interface TransactionEventConsumerOptions {
  kafka: Kafka
  logger: Logger
  groupId: string
  applyTransaction: ApplyTransactionToWalletsUseCase
}

export async function createTransactionEventConsumer(options: TransactionEventConsumerOptions): Promise<EventConsumer> {
  const { kafka, logger, groupId, applyTransaction } = options

  return createEventConsumer({
    kafka,
    logger,
    groupId,
    subscription: {
      topic: TOPICS.TRANSACTION,
      schema: transactionEventSchema,
      handler: async (event: TransactionEvent) => {
        switch (event.type) {
          case 'charge.completed':
          case 'refund.completed': {
            const { fromWalletId, toWalletId, amount, currency, transactionId } = event.payload
            await applyTransaction.execute({ fromWalletId, toWalletId, amount, currency })
            logger.info({ transactionId, type: event.type }, 'wallet balances mirrored from transaction event')
            return
          }
          case 'charge.declined':
          case 'refund.declined': {
            // No money moved — nothing to mirror. Log at debug for visibility.
            logger.debug(
              { transactionId: event.payload.transactionId, type: event.type },
              'declined transaction event acknowledged, no balance change',
            )
            return
          }
        }
      },
    },
  })
}
