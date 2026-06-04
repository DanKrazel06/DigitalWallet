import type { OutboxWriter } from '../domain/ports.js'
import type { PrismaLike } from './prisma-types.js'

// PrismaOutboxWriter — appends a row to the `outbox_events` table.
// Must run inside the same Prisma transaction as the business write so
// either both commit together, or neither does. The transaction is
// provided by PrismaUnitOfWork.
export class PrismaOutboxWriter implements OutboxWriter {
  constructor(private readonly prisma: PrismaLike) {}

  async append(input: { aggregateId: string; topic: string; payload: unknown }): Promise<void> {
    await this.prisma.outboxEvent.create({
      data: {
        aggregateId: input.aggregateId,
        topic: input.topic,
        payload: input.payload as object,
      },
    })
  }
}
