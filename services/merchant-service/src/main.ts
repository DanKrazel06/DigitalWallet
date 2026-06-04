import Fastify from 'fastify'
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod'
import { createLogger } from '@walletdigital/logger'
import { createEventPublisher, createKafkaClient } from '@walletdigital/kafka'
import { createOutboxRelay } from '@walletdigital/prisma'

import { loadConfig } from './config.js'

import { createPrismaClient } from './infrastructure/prisma-client.js'
import { PrismaMerchantRepository } from './infrastructure/prisma-merchant.repository.js'
import { PrismaUnitOfWork } from './infrastructure/prisma-unit-of-work.js'

import { MerchantService } from './application/merchant.service.js'
import { CreateMerchantUseCase } from './application/create-merchant.use-case.js'
import { UpdateMerchantStatusUseCase } from './application/update-merchant-status.use-case.js'

import { registerRoutes } from './interfaces/http/routes.js'
import { errorHandler } from './interfaces/http/error-handler.js'

// Composition root for merchant-service.
//
// merchant-service holds the identity of business actors (merchants).
// No Kafka consumer in this milestone — merchants are created via HTTP
// (POST /merchants) and downstream services react to merchant.created /
// merchant.status_changed events emitted by the outbox relay.
async function bootstrap(): Promise<void> {
  // 1. Config + logger
  const config = loadConfig()
  const logger = createLogger({ service: 'merchant-service', level: config.LOG_LEVEL })

  // 2. External clients
  const prisma = createPrismaClient(config.DATABASE_URL, logger)
  const kafka = createKafkaClient({
    brokers: config.KAFKA_BROKERS.split(','),
    clientId: config.KAFKA_CLIENT_ID,
  })

  // 3. Infrastructure adapters
  const merchantsRepo = new PrismaMerchantRepository(prisma)
  const unitOfWork = new PrismaUnitOfWork(prisma)

  // 4. Application layer
  const merchantService = new MerchantService(merchantsRepo)
  const createMerchantUseCase = new CreateMerchantUseCase(unitOfWork)
  const updateMerchantStatusUseCase = new UpdateMerchantStatusUseCase(merchantsRepo, unitOfWork)

  // 5. HTTP server
  const app = Fastify({
    logger: {
      level: config.LOG_LEVEL,
      base: { service: 'merchant-service' },
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
  app.get('/health', async () => ({ status: 'ok', service: 'merchant-service' }))
  await registerRoutes(app, {
    merchantService,
    createMerchantUseCase,
    updateMerchantStatusUseCase,
  })

  // 6. Kafka — publisher + outbox relay (no consumer in this service)
  const eventPublisher = await createEventPublisher({ kafka, logger })
  const outboxRelay = createOutboxRelay({ prisma, publisher: eventPublisher, logger })
  outboxRelay.start()

  // 7. Graceful shutdown — close HTTP first, drain the relay, then deps.
  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'shutting down')
    try {
      await app.close()
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
  logger.info({ host: config.HOST, port: config.PORT }, 'merchant-service started')
}

bootstrap().catch((err) => {
  console.error('merchant-service failed to start:', err)
  process.exit(1)
})
