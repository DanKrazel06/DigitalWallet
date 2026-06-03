import type { PrismaClient } from '../generated/prisma/index.js'
import type { TransactionalPorts, UnitOfWork } from '../domain/ports.js'
import { PrismaUserRepository } from './prisma-user.repository.js'
import { PrismaOutboxWriter } from './prisma-outbox.writer.js'
import type { PrismaLike } from './prisma-types.js'

// PrismaUnitOfWork — concrete implementation of the UnitOfWork port.
//
// Opens a Prisma transaction and builds transactional copies of every
// repository that should participate in it. Both the user write and the
// outbox append therefore share the same `tx` client, so they commit or
// roll back as a single unit. This is what makes the Transactional Outbox
// pattern actually atomic.
//
// Callers use it like this:
//   await uow.withTransaction(async ({ users, outbox }) => {
//     await users.save(user)
//     await outbox.append({ ... })
//   })
export class PrismaUnitOfWork implements UnitOfWork {
  constructor(private readonly prisma: PrismaClient) {}

  async withTransaction<T>(work: (ports: TransactionalPorts) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(async (tx: PrismaLike) => {
      const ports: TransactionalPorts = {
        users: new PrismaUserRepository(tx),
        outbox: new PrismaOutboxWriter(tx),
      }
      return work(ports)
    })
  }
}
