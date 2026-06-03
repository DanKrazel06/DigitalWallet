import { PrismaClient } from '../generated/prisma/index.js'
import type { Logger } from '@walletdigital/logger'

// Local Prisma client builder for wallet-service. Each microservice
// generates its own client from its own schema.
export function createPrismaClient(databaseUrl: string, _logger: Logger): PrismaClient {
  return new PrismaClient({
    datasources: { db: { url: databaseUrl } },
    log: ['warn', 'error'],
  })
}
