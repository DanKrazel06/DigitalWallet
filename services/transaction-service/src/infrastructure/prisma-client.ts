import { PrismaClient } from '../generated/prisma/index.js'
import type { Logger } from '@walletdigital/logger'

export function createPrismaClient(databaseUrl: string, _logger: Logger): PrismaClient {
  return new PrismaClient({
    datasources: { db: { url: databaseUrl } },
    log: ['warn', 'error'],
  })
}
