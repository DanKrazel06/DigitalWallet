import Fastify from 'fastify'
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod'
import { createLogger } from '@walletdigital/logger'
import { createEventPublisher, createKafkaClient } from '@walletdigital/kafka'
import { createOutboxRelay } from '@walletdigital/prisma'

import { loadConfig } from './config.js'

import { createPrismaClient } from './infrastructure/prisma-client.js'
import { PrismaWalletProjectionRepository } from './infrastructure/prisma-wallet-projection.repository.js'
import { PrismaMerchantProjectionRepository } from './infrastructure/prisma-merchant-projection.repository.js'
import { PrismaTransactionRepository } from './infrastructure/prisma-transaction.repository.js'
import { PrismaUnitOfWork } from './infrastructure/prisma-unit-of-work.js'
import { createWalletEventConsumer } from './infrastructure/wallet-event.consumer.js'
import { createMerchantEventConsumer } from './infrastructure/merchant-event.consumer.js'

import { CreateChargeUseCase } from './application/create-charge.use-case.js'
import { CreateRefundUseCase } from './application/create-refund.use-case.js'
import { ProjectWalletFromCreatedUseCase, ProjectWalletStatusUseCase } from './application/project-wallet.use-case.js'
import {
  ProjectMerchantFromCreatedUseCase,
  ProjectMerchantStatusUseCase,
} from './application/project-merchant.use-case.js'
import { TransactionService } from './application/transaction.service.js'
import { LedgerService } from './application/ledger.service.js'
import { PrismaLedgerRepository } from './infrastructure/prisma-ledger.repository.js'

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
  const merchantsRepo = new PrismaMerchantProjectionRepository(prisma)
  const transactionsRepo = new PrismaTransactionRepository(prisma)
  const ledgerRepo = new PrismaLedgerRepository(prisma)
  const unitOfWork = new PrismaUnitOfWork(prisma)

  // 4. Application layer
  const transactionService = new TransactionService(transactionsRepo)
  const ledgerService = new LedgerService(ledgerRepo, walletsRepo, transactionsRepo)
  const createChargeUseCase = new CreateChargeUseCase(transactionsRepo, unitOfWork)
  const createRefundUseCase = new CreateRefundUseCase(transactionsRepo, unitOfWork)
  const projectWalletUseCase = new ProjectWalletFromCreatedUseCase(walletsRepo)
  const projectWalletStatusUseCase = new ProjectWalletStatusUseCase(walletsRepo)
  const projectMerchantUseCase = new ProjectMerchantFromCreatedUseCase(merchantsRepo)
  const projectMerchantStatusUseCase = new ProjectMerchantStatusUseCase(merchantsRepo)

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
  await registerRoutes(app, {
    transactionService,
    ledgerService,
    createChargeUseCase,
    createRefundUseCase,
  })

  // 6. Kafka — outbox relay (publishes charge/refund completed/declined)
  //         + consumers of walletdigital.wallet and walletdigital.merchant
  //         to keep the local projections in sync.
  const eventPublisher = await createEventPublisher({ kafka, logger })
  const outboxRelay = createOutboxRelay({ prisma, publisher: eventPublisher, logger })
  outboxRelay.start()

  const walletConsumer = await createWalletEventConsumer({
    kafka,
    logger,
    groupId: `${config.KAFKA_CONSUMER_GROUP}-wallet`,
    projectWallet: projectWalletUseCase,
    projectWalletStatus: projectWalletStatusUseCase,
  })
  await walletConsumer.run()

  const merchantConsumer = await createMerchantEventConsumer({
    kafka,
    logger,
    groupId: `${config.KAFKA_CONSUMER_GROUP}-merchant`,
    projectMerchant: projectMerchantUseCase,
    projectMerchantStatus: projectMerchantStatusUseCase,
  })
  await merchantConsumer.run()

  // 7. Graceful shutdown
  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'shutting down')
    try {
      await app.close()
      await walletConsumer.disconnect()
      await merchantConsumer.disconnect()
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
