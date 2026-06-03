import { PrismaClient } from '../generated/prisma/index.js'
import type { Logger } from '@walletdigital/logger'

// Local Prisma client builder.
//
// Each microservice owns its schema and generates its own Prisma client.
// We don't share the client across services because that would break the
// "database per service" invariant — services must reach each other via
// REST or Kafka, never by reading each other's tables.
export function createPrismaClient(databaseUrl: string, _logger: Logger): PrismaClient {
  // The logger parameter is accepted for API symmetry with other services
  // and will be wired into Prisma's $on('warn'|'error') events when we
  // adopt Prisma's new event API. For now we rely on stdout for warnings
  // / errors — Pino will pick them up from the Fastify-level logger.
  return new PrismaClient({
    datasources: { db: { url: databaseUrl } },
    log: ['warn', 'error'],
  })
}
