import type { PrismaClient } from '../generated/prisma/index.js'
import type { TransactionalPorts, UnitOfWork } from '../domain/ports.js'
import { PrismaMerchantRepository } from './prisma-merchant.repository.js'
import { PrismaOutboxWriter } from './prisma-outbox.writer.js'
import type { PrismaLike } from './prisma-types.js'

// PrismaUnitOfWork — opens a Prisma transaction and builds transactional
// copies of every repository that participates in it. The merchant write
// and the outbox append therefore share the same `tx` client, so the
// Transactional Outbox pattern is actually atomic.
export class PrismaUnitOfWork implements UnitOfWork {
  constructor(private readonly prisma: PrismaClient) {}

  async withTransaction<T>(work: (ports: TransactionalPorts) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(async (tx: PrismaLike) => {
      const ports: TransactionalPorts = {
        merchants: new PrismaMerchantRepository(tx),
        outbox: new PrismaOutboxWriter(tx),
      }
      return work(ports)
    })
  }
}
