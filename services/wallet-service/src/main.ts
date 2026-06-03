import Fastify from 'fastify'
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod'
import { createLogger } from '@walletdigital/logger'
import { createEventPublisher, createKafkaClient } from '@walletdigital/kafka'
import { createOutboxRelay } from '@walletdigital/prisma'

import { loadConfig } from './config.js'

import { createPrismaClient } from './infrastructure/prisma-client.js'
import { PrismaWalletRepository } from './infrastructure/prisma-wallet.repository.js'
import { PrismaUnitOfWork } from './infrastructure/prisma-unit-of-work.js'
import { createAccountEventConsumer } from './infrastructure/account-event.consumer.js'

import { WalletService } from './application/wallet.service.js'
import { CreateWalletFromAccountUseCase } from './application/create-wallet.use-case.js'

import { registerRoutes } from './interfaces/http/routes.js'
import { errorHandler } from './interfaces/http/error-handler.js'

// Composition root for wallet-service.
async function bootstrap(): Promise<void> {
  // 1. Config + logger
  const config = loadConfig()
  const logger = createLogger({ service: 'wallet-service', level: config.LOG_LEVEL })

  // 2. External clients
  const prisma = createPrismaClient(config.DATABASE_URL, logger)
  const kafka = createKafkaClient({
    brokers: config.KAFKA_BROKERS.split(','),
    clientId: config.KAFKA_CLIENT_ID,
  })

  // 3. Infrastructure adapters
  const walletsRepo = new PrismaWalletRepository(prisma)
  const unitOfWork = new PrismaUnitOfWork(prisma)

  // 4. Application layer
  const walletService = new WalletService(walletsRepo)
  const createWalletUseCase = new CreateWalletFromAccountUseCase(walletsRepo, unitOfWork)

  // 5. HTTP server
  const app = Fastify({
    logger: {
      level: config.LOG_LEVEL,
      base: { service: 'wallet-service' },
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
  app.get('/health', async () => ({ status: 'ok', service: 'wallet-service' }))
  await registerRoutes(app, { walletService })

  // 6. Kafka — publisher (for wallet.created from create-wallet)
  //         + consumer (subscribes to walletdigital.account)
  const eventPublisher = await createEventPublisher({ kafka, logger })
  const outboxRelay = createOutboxRelay({ prisma, publisher: eventPublisher, logger })
  outboxRelay.start()

  const accountConsumer = await createAccountEventConsumer({
    kafka,
    logger,
    groupId: config.KAFKA_CONSUMER_GROUP,
    createWallet: createWalletUseCase,
    defaultCurrency: config.DEFAULT_CURRENCY,
  })
  await accountConsumer.run()

  // 7. Graceful shutdown
  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'shutting down')
    try {
      await app.close()
      await accountConsumer.disconnect()
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
  logger.info({ host: config.HOST, port: config.PORT }, 'wallet-service started')
}

bootstrap().catch((err) => {
  console.error('wallet-service failed to start:', err)
  process.exit(1)
})
