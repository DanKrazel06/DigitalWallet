import type { PrismaClient } from '../generated/prisma/index.js'
import type { TransactionalPorts, UnitOfWork } from '../domain/ports.js'
import { PrismaWalletProjectionRepository } from './prisma-wallet-projection.repository.js'
import { PrismaTransactionRepository } from './prisma-transaction.repository.js'
import { PrismaLedgerRepository } from './prisma-ledger.repository.js'
import { PrismaOutboxWriter } from './prisma-outbox.writer.js'
import type { PrismaLike } from './prisma-types.js'

// PrismaUnitOfWork — opens a Postgres transaction and builds
// transactional copies of every repository participating in it. The
// callback receives a `ports` object whose repositories all share the
// SAME `tx` client, so the SELECT FOR UPDATE locks taken on wallets are
// honoured for the duration of the whole transfer.
//
// `maxWait` controls how long a request waits to enter the transaction
// pool; `timeout` is the max duration of the transaction itself. Both
// generous enough to absorb a slow Kafka publish during outbox-relay
// (though here the publish happens AFTER the transaction commits, so
// only the local writes count).
export class PrismaUnitOfWork implements UnitOfWork {
  constructor(private readonly prisma: PrismaClient) {}

  async withTransaction<T>(work: (ports: TransactionalPorts) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(
      async (tx: PrismaLike) => {
        const ports: TransactionalPorts = {
          wallets: new PrismaWalletProjectionRepository(tx),
          transactions: new PrismaTransactionRepository(tx),
          ledger: new PrismaLedgerRepository(tx),
          outbox: new PrismaOutboxWriter(tx),
        }
        return work(ports)
      },
      { timeout: 15_000, maxWait: 5_000 },
    )
  }
}
