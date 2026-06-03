import type { Kafka } from 'kafkajs'
import type { Logger } from '@walletdigital/logger'
import { TOPICS, userEventSchema, type UserEvent } from '@walletdigital/events'
import { createEventConsumer, type EventConsumer } from '@walletdigital/kafka'
import type { CreateAccountFromUserUseCase } from '../application/create-account.use-case.js'

// UserEventConsumer — subscribes to `walletdigital.user` and reacts to
// the events relevant to account-service.
//
// Currently only `user.created` triggers work (auto-provision a profile).
// Adding more user.* events later means just extending the switch below.
// Kafka delivery is at-least-once; the use-case is idempotent (it checks
// for an existing account by userId before inserting), so a redelivered
// event is safely ignored.
export interface UserEventConsumerOptions {
  kafka: Kafka
  logger: Logger
  groupId: string
  createAccount: CreateAccountFromUserUseCase
}

export async function createUserEventConsumer(options: UserEventConsumerOptions): Promise<EventConsumer> {
  const { kafka, logger, groupId, createAccount } = options

  return createEventConsumer({
    kafka,
    logger,
    groupId,
    subscription: {
      topic: TOPICS.USER,
      schema: userEventSchema,
      // The handler receives a fully validated, fully-typed UserEvent
      // (discriminated union). TS forces us to handle every variant
      // through the exhaustive switch.
      handler: async (event: UserEvent) => {
        switch (event.type) {
          case 'user.created': {
            const result = await createAccount.execute({
              userId: event.payload.userId,
              email: event.payload.email,
            })
            if (result === null) {
              logger.debug(
                { userId: event.payload.userId },
                'account already exists for user — skipped',
              )
            } else {
              logger.info(
                { userId: result.userId, accountId: result.accountId },
                'account created from user.created event',
              )
            }
            return
          }
          case 'user.deleted': {
            // Out of scope for this milestone — we will mark the account
            // as archived when the deletion flow is implemented.
            logger.debug({ userId: event.payload.userId }, 'user.deleted received; not handled yet')
            return
          }
        }
      },
    },
  })
}
