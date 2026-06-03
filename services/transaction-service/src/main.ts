import Fastify from 'fastify'
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod'
import { createLogger } from '@walletdigital/logger'
import { createEventPublisher, createKafkaClient } from '@walletdigital/kafka'
import { createOutboxRelay } from '@walletdigital/prisma'

import { loadConfig } from './config.js'

import { createPrismaClient } from './infrastructure/prisma-client.js'
import { PrismaWalletProjectionRepository } from './infrastructure/prisma-wallet-projection.repository.js'
import { PrismaTransactionRepository } from './infrastructure/prisma-transaction.repository.js'
import { PrismaUnitOfWork } from './infrastructure/prisma-unit-of-work.js'
import { createWalletEventConsumer } from './infrastructure/wallet-event.consumer.js'

import { CreateTransferUseCase } from './application/create-transfer.use-case.js'
import { ProjectWalletFromCreatedUseCase } from './application/project-wallet.use-case.js'
import { TransactionService } from './application/transaction.service.js'

import { registerRoutes } from './interfaces/http/routes.js'
import { errorHandler } from './interfaces/http/error-handler.js'

// Composition root for transaction-service.
async function bootstrap(): Promise<void> {
  // 1. Config + logger
  const config = loadConfig()
  const logger = createLogger({ service: 'transaction-service', level: config.LOG_LEVEL })

  // 2. External clients
  const prisma = createPrismaClient(config.DATABASE_URL, logger)
  const kafka = createKafkaClient({
    brokers: config.KAFKA_BROKERS.split(','),
    clientId: config.KAFKA_CLIENT_ID,
  })

  // 3. Infrastructure adapters
  const walletsRepo = new PrismaWalletProjectionRepository(prisma)
  const transactionsRepo = new PrismaTransactionRepository(prisma)
  const unitOfWork = new PrismaUnitOfWork(prisma)

  // 4. Application layer
  const transactionService = new TransactionService(transactionsRepo)
  const createTransferUseCase = new CreateTransferUseCase(transactionsRepo, unitOfWork)
  const projectWalletUseCase = new ProjectWalletFromCreatedUseCase(walletsRepo)

  // 5. HTTP server
  const app = Fastify({
    logger: {
      level: config.LOG_LEVEL,
      base: { service: 'transaction-service' },
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
  app.get('/health', async () => ({ status: 'ok', service: 'transaction-service' }))
  await registerRoutes(app, { createTransferUseCase, transactionService })

  // 6. Kafka — outbox relay (publishes transaction.completed / failed)
  //         + consumer of walletdigital.wallet to keep the projection in sync.
  const eventPublisher = await createEventPublisher({ kafka, logger })
  const outboxRelay = createOutboxRelay({ prisma, publisher: eventPublisher, logger })
  outboxRelay.start()

  const walletConsumer = await createWalletEventConsumer({
    kafka,
    logger,
    groupId: config.KAFKA_CONSUMER_GROUP,
    projectWallet: projectWalletUseCase,
  })
  await walletConsumer.run()

  // 7. Graceful shutdown
  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'shutting down')
    try {
      await app.close()
      await walletConsumer.disconnect()
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
  logger.info({ host: config.HOST, port: config.PORT }, 'transaction-service started')
}

bootstrap().catch((err) => {
  console.error('transaction-service failed to start:', err)
  process.exit(1)
})
