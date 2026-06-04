import { PrismaClient } from '../generated/prisma/index.js'
import type { Logger } from '@walletdigital/logger'

// Local Prisma client builder for account-service. See auth-service for
// the rationale behind not sharing the client across services.
export function createPrismaClient(databaseUrl: string, _logger: Logger): PrismaClient {
  return new PrismaClient({
    datasources: { db: { url: databaseUrl } },
    log: ['warn', 'error'],
  })
}
