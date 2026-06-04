import type { Kafka } from 'kafkajs'
import type { Logger } from '@walletdigital/logger'
import { TOPICS, merchantEventSchema, type MerchantEvent } from '@walletdigital/events'
import { createEventConsumer, type EventConsumer } from '@walletdigital/kafka'
import type { CreateWalletForMerchantUseCase } from '../application/create-wallet.use-case.js'
import type { Currency } from '../domain/money.js'

// MerchantEventConsumer — subscribes to `walletdigital.merchant` and
// provisions a wallet for each newly-created merchant.
//
// Only `merchant.created` triggers work right now; `merchant.status_changed`
// is acknowledged silently (no wallet action — wallet activation is
// independent of merchant status in this milestone).
//
// At-least-once delivery: the use-case is idempotent (checks for an
// existing wallet by merchantId before inserting), so redelivered events
// are safely no-ops.
export interface MerchantEventConsumerOptions {
  kafka: Kafka
  logger: Logger
  groupId: string
  createWallet: CreateWalletForMerchantUseCase
  defaultCurrency: Currency
}

export async function createMerchantEventConsumer(options: MerchantEventConsumerOptions): Promise<EventConsumer> {
  const { kafka, logger, groupId, createWallet, defaultCurrency } = options

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
            const result = await createWallet.execute({
              merchantId: event.payload.merchantId,
              currency: defaultCurrency,
            })
            if (result === null) {
              logger.debug({ merchantId: event.payload.merchantId }, 'wallet already exists for merchant — skipped')
            } else {
              logger.info(
                { merchantId: result.merchantId, walletId: result.walletId },
                'wallet created from merchant.created event',
              )
            }
            return
          }
          case 'merchant.status_changed': {
            // No-op for now. A future milestone could mirror the merchant
            // status onto its wallet (e.g. freeze when merchant disabled).
            logger.debug(
              { merchantId: event.payload.merchantId, status: event.payload.status },
              'merchant.status_changed received; no wallet action',
            )
            return
          }
        }
      },
    },
  })
}
