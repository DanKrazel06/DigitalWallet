import Fastify from 'fastify'
import { Redis } from 'ioredis'
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod'
import { createLogger } from '@walletdigital/logger'
import { createEventPublisher, createKafkaClient } from '@walletdigital/kafka'

import { loadConfig } from './config.js'

import { createPrismaClient } from './infrastructure/prisma-client.js'
import { PrismaUserRepository } from './infrastructure/prisma-user.repository.js'
import { PrismaUnitOfWork } from './infrastructure/prisma-unit-of-work.js'
import { Argon2PasswordHasher } from './infrastructure/argon2-password.hasher.js'
import { JoseTokenService } from './infrastructure/jose-token.service.js'
import { RedisRefreshTokenStore } from './infrastructure/redis-refresh-token.store.js'
import { createOutboxRelay } from '@walletdigital/prisma'

import { AuthService } from './application/auth.service.js'
import { SignupUseCase } from './application/signup.use-case.js'

import { registerRoutes } from './interfaces/http/routes.js'
import { errorHandler } from './interfaces/http/error-handler.js'

// Composition root for auth-service.
//
// `bootstrap` is the ONLY place where concrete adapters (Prisma, Redis,
// Kafka, Argon2, Jose) are instantiated and wired into use-cases. The rest
// of the codebase depends on abstractions (ports) and stays portable.
// If we ever swap Prisma → Drizzle or Redis → Valkey, only this file changes.
async function bootstrap(): Promise<void> {
  // ---------------------------------------------------------------------------
  // 1. Configuration + structured logger
  // ---------------------------------------------------------------------------
  const config = loadConfig()
  const logger = createLogger({ service: 'auth-service', level: config.LOG_LEVEL })

  // ---------------------------------------------------------------------------
  // 2. External clients (PostgreSQL, Redis, Kafka)
  //    Constructed once and shared across adapters to reuse connection pools.
  // ---------------------------------------------------------------------------
  const prisma = createPrismaClient(config.DATABASE_URL, logger)
  const redis = new Redis(config.REDIS_URL, { lazyConnect: false, maxRetriesPerRequest: 3 })
  const kafka = createKafkaClient({
    brokers: config.KAFKA_BROKERS.split(','),
    clientId: config.KAFKA_CLIENT_ID,
  })

  // Surface connection-level errors to the structured logger instead of
  // letting them bubble up unhandled on the event loop.
  redis.on('error', (err) => logger.error({ err }, 'redis error'))

  // ---------------------------------------------------------------------------
  // 3. Infrastructure adapters — implementations of the domain ports
  // ---------------------------------------------------------------------------
  const usersRepo = new PrismaUserRepository(prisma)
  const unitOfWork = new PrismaUnitOfWork(prisma)
  const passwordHasher = new Argon2PasswordHasher()
  const tokenService = new JoseTokenService({
    secret: config.JWT_SECRET,
    ttlSeconds: config.JWT_ACCESS_TTL_SECONDS,
    issuer: config.JWT_ISSUER,
    audience: config.JWT_AUDIENCE,
  })
  const refreshTokenStore = new RedisRefreshTokenStore({
    redis,
    ttlSeconds: config.REFRESH_TOKEN_TTL_SECONDS,
  })

  // ---------------------------------------------------------------------------
  // 4. Application layer — service + isolated signup use-case
  // ---------------------------------------------------------------------------
  const authService = new AuthService(usersRepo, passwordHasher, tokenService, refreshTokenStore)
  const signupUseCase = new SignupUseCase(usersRepo, passwordHasher, unitOfWork)

  // ---------------------------------------------------------------------------
  // 5. HTTP server (Fastify) + Zod type provider + routes + error handler
  //
  // We let Fastify build its OWN Pino logger from the level + transport
  // config. The shared `logger` is kept for non-HTTP logs (infrastructure
  // adapters, shutdown, etc.). Both log to the same place in practice;
  // this just avoids a type mismatch between FastifyBaseLogger and our
  // standalone Pino Logger instance.
  // ---------------------------------------------------------------------------
  const app = Fastify({
    logger: {
      level: config.LOG_LEVEL,
      base: { service: 'auth-service' },
      // Pretty-print in dev for readability; raw JSON in prod for log shippers.
      ...(config.NODE_ENV !== 'production'
        ? { transport: { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:HH:MM:ss.l', ignore: 'pid,hostname' } } }
        : {}),
    },
  })
  // Plug Zod as the schema validator/serializer for all routes.
  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)
  app.setErrorHandler(errorHandler)

  // Liveness probe — kept here (not in routes.ts) so it works even if the
  // routes registration fails.
  app.get('/health', async () => ({ status: 'ok', service: 'auth-service' }))

  await registerRoutes(app, {
    authService,
    signupUseCase,
    tokens: tokenService,
  })

  // ---------------------------------------------------------------------------
  // 5b. Outbox relay — background worker that drains outbox_events to Kafka.
  //
  // Started AFTER routes are registered (so the service can already serve
  // HTTP traffic even if Kafka is slow to come up) and BEFORE app.listen
  // (so rows queued during the previous run are picked up immediately).
  // ---------------------------------------------------------------------------
  const eventPublisher = await createEventPublisher({ kafka, logger })
  const outboxRelay = createOutboxRelay({
    prisma,
    publisher: eventPublisher,
    logger,
  })
  outboxRelay.start()

  // ---------------------------------------------------------------------------
  // 6. Graceful shutdown — close HTTP first, then drain external clients.
  // SIGINT  = Ctrl+C in dev. SIGTERM = `docker stop` / `kubectl delete pod`.
  // ---------------------------------------------------------------------------
  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'shutting down')
    try {
      // Order matters: stop accepting HTTP first, then drain the relay
      // (no more outbox writes will come), then close external clients.
      await app.close()
      await outboxRelay.stop()
      await eventPublisher.disconnect()
      await prisma.$disconnect()
      await redis.quit()
    } catch (err) {
      logger.error({ err }, 'error during shutdown')
    }
    process.exit(0)
  }
  process.on('SIGINT', () => void shutdown('SIGINT'))
  process.on('SIGTERM', () => void shutdown('SIGTERM'))

  // ---------------------------------------------------------------------------
  // 7. Start listening
  // ---------------------------------------------------------------------------
  await app.listen({ host: config.HOST, port: config.PORT })
  logger.info({ host: config.HOST, port: config.PORT }, 'auth-service started')
}

bootstrap().catch((err) => {
  // Last-resort handler — log and exit non-zero so orchestrators
  // (compose / k8s) can decide to restart the service.
  console.error('auth-service failed to start:', err)
  process.exit(1)
})
