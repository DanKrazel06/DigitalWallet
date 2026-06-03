import Fastify from 'fastify'
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod'
import { createLogger } from '@walletdigital/logger'
import { createEventPublisher, createKafkaClient } from '@walletdigital/kafka'

import { loadConfig } from './config.js'

import { createPrismaClient } from './infrastructure/prisma-client.js'
import { PrismaAccountRepository } from './infrastructure/prisma-account.repository.js'
import { PrismaUnitOfWork } from './infrastructure/prisma-unit-of-work.js'
import { createOutboxRelay } from '@walletdigital/prisma'
import { createUserEventConsumer } from './infrastructure/user-event.consumer.js'

import { AccountService } from './application/account.service.js'
import { CreateAccountFromUserUseCase } from './application/create-account.use-case.js'

import { registerRoutes } from './interfaces/http/routes.js'
import { errorHandler } from './interfaces/http/error-handler.js'

// Composition root for account-service.
// Same pattern as auth-service:
//   1. config + logger
//   2. external clients (PG, Kafka)
//   3. infrastructure adapters
//   4. application services / use-cases
//   5. HTTP server + routes
//   6. Kafka consumer + outbox relay
//   7. graceful shutdown
//   8. listen
async function bootstrap(): Promise<void> {
  // 1. Config + logger
  const config = loadConfig()
  const logger = createLogger({ service: 'account-service', level: config.LOG_LEVEL })

  // 2. External clients
  const prisma = createPrismaClient(config.DATABASE_URL, logger)
  const kafka = createKafkaClient({
    brokers: config.KAFKA_BROKERS.split(','),
    clientId: config.KAFKA_CLIENT_ID,
  })

  // 3. Infrastructure adapters
  const accountsRepo = new PrismaAccountRepository(prisma)
  const unitOfWork = new PrismaUnitOfWork(prisma)

  // 4. Application layer
  const accountService = new AccountService(accountsRepo)
  const createAccountUseCase = new CreateAccountFromUserUseCase(accountsRepo, unitOfWork)

  // 5. HTTP server
  const app = Fastify({
    logger: {
      level: config.LOG_LEVEL,
      base: { service: 'account-service' },
      ...(config.NODE_ENV !== 'production'
        ? {
            transport: {
              target: 'pino-pretty',
              options: { colorize: true, translateTime: 'SYS:HH:MM:ss.l', ignore: 'pid,hostname' },
            },
          }
        : {}),
    },
  })
  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)
  app.setErrorHandler(errorHandler)
  app.get('/health', async () => ({ status: 'ok', service: 'account-service' }))
  await registerRoutes(app, { accountService })

  // 6. Kafka — publisher (for outbox.created emitted from create-account)
  //         + consumer (subscribes to walletdigital.user)
  const eventPublisher = await createEventPublisher({ kafka, logger })
  const outboxRelay = createOutboxRelay({ prisma, publisher: eventPublisher, logger })
  outboxRelay.start()

  const userConsumer = await createUserEventConsumer({
    kafka,
    logger,
    groupId: config.KAFKA_CONSUMER_GROUP,
    createAccount: createAccountUseCase,
  })
  // `run()` resolves once the consumer joins the group; the actual message
  // processing keeps running in the background until `disconnect()` is called.
  await userConsumer.run()

  // 7. Graceful shutdown — order matters: stop accepting new HTTP
  //    requests, drain in-flight work, then stop the consumer (so we
  //    don't pull more events we won't process), then the relay,
  //    then the publisher, then the DB.
  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'shutting down')
    try {
      await app.close()
      await userConsumer.disconnect()
      await outboxRelay.stop()
      await eventPublisher.disconnect()
      await prisma.$disconnect()
    } catch (err) {
      logger.error({ err }, 'error during shutdown')
    }
    process.exit(0)
  }
  process.on('SIGINT', () => void shutdown('SIGINT'))
  process.on('SIGTERM', () => void shutdown('SIGTERM'))

  // 8. Start listening
  await app.listen({ host: config.HOST, port: config.PORT })
  logger.info({ host: config.HOST, port: config.PORT }, 'account-service started')
}

bootstrap().catch((err) => {
  console.error('account-service failed to start:', err)
  process.exit(1)
})
