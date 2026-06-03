import type { OutboxWriter } from '../domain/ports.js'
import type { PrismaLike } from './prisma-types.js'

// Same shape as the other services'. Writes a row in `outbox_events`
// inside the surrounding transaction so the relay can publish later.
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
