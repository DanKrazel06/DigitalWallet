import type { Kafka } from 'kafkajs'
import type { Logger } from '@walletdigital/logger'
import { TOPICS, accountEventSchema, type AccountEvent } from '@walletdigital/events'
import { createEventConsumer, type EventConsumer } from '@walletdigital/kafka'
import type { CreateWalletFromAccountUseCase } from '../application/create-wallet.use-case.js'
import type { Currency } from '../domain/money.js'

// AccountEventConsumer — subscribes to `walletdigital.account` and
// provisions a wallet for each new account.
//
// Only `account.created` triggers work right now. The handler receives a
// fully-validated event thanks to the Zod schema; TS forces the switch
// to be exhaustive across the discriminated union.
//
// At-least-once delivery: the use-case is idempotent (checks for an
// existing wallet by user+currency before inserting), so redelivered
// events are safely no-ops.
export interface AccountEventConsumerOptions {
  kafka: Kafka
  logger: Logger
  groupId: string
  createWallet: CreateWalletFromAccountUseCase
  defaultCurrency: Currency
}

export async function createAccountEventConsumer(
  options: AccountEventConsumerOptions,
): Promise<EventConsumer> {
  const { kafka, logger, groupId, createWallet, defaultCurrency } = options

  return createEventConsumer({
    kafka,
    logger,
    groupId,
    subscription: {
      topic: TOPICS.ACCOUNT,
      schema: accountEventSchema,
      handler: async (event: AccountEvent) => {
        switch (event.type) {
          case 'account.created': {
            const result = await createWallet.execute({
              userId: event.payload.userId,
              accountId: event.payload.accountId,
              currency: defaultCurrency,
            })
            if (result === null) {
              logger.debug(
                { userId: event.payload.userId, currency: defaultCurrency },
                'wallet already exists for user — skipped',
              )
            } else {
              logger.info(
                { userId: result.userId, walletId: result.walletId, currency: result.currency },
                'wallet created from account.created event',
              )
            }
            return
          }
        }
      },
    },
  })
}
