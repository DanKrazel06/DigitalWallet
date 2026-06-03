import type { Logger } from '@walletdigital/logger'
import type { EventPublisher } from '@walletdigital/kafka'
import type { Topic } from '@walletdigital/events'
import type { OutboxRow, PrismaRootClient } from './types.js'

// Generic outbox relay — drains the `outbox_events` table into Kafka.
//
// Used identically by every microservice. The concrete Prisma client is
// accepted via the structural `PrismaRootClient` interface so we don't
// have to depend on @prisma/client (which is per-service).
//
// Loop semantics (unchanged from the in-service prototype):
//   - Wakes every `pollIntervalMs`
//   - Locks up to `batchSize` unpublished rows with `FOR UPDATE SKIP LOCKED`
//   - Publishes each row, then marks it as published
//   - At-least-once delivery: consumers MUST be idempotent

export interface OutboxRelayOptions {
  prisma: PrismaRootClient
  publisher: EventPublisher
  logger: Logger
  pollIntervalMs?: number
  batchSize?: number
}

export interface OutboxRelay {
  start(): void
  stop(): Promise<void>
}

export function createOutboxRelay(options: OutboxRelayOptions): OutboxRelay {
  const { prisma, publisher, logger } = options
  const pollIntervalMs = options.pollIntervalMs ?? 500
  const batchSize = options.batchSize ?? 50

  let running = false
  let stopRequested = false
  let nextTickTimer: NodeJS.Timeout | null = null

  async function tick(): Promise<void> {
    if (stopRequested) return
    running = true
    try {
      const rows = await prisma.$transaction(
        async (tx) => {
          const picked = await tx.$queryRawUnsafe<OutboxRow[]>(
            `SELECT id, aggregate_id, topic, payload
               FROM outbox_events
              WHERE published_at IS NULL
              ORDER BY created_at ASC
              LIMIT $1
              FOR UPDATE SKIP LOCKED`,
            batchSize,
          )

          for (const row of picked) {
            try {
              await publisher.publish(row.topic as Topic, row.aggregate_id, row.payload as never)
              await tx.outboxEvent.update({
                where: { id: row.id },
                data: { publishedAt: new Date() },
              })
            } catch (err) {
              logger.warn({ err, outboxId: row.id }, 'outbox publish failed; will retry')
            }
          }
          return picked
        },
        { timeout: 30_000, maxWait: 5_000 },
      )

      if (rows.length > 0) {
        logger.debug({ count: rows.length }, 'outbox batch processed')
      }
    } catch (err) {
      logger.error({ err }, 'outbox relay tick failed')
    } finally {
      running = false
      if (!stopRequested) {
        nextTickTimer = setTimeout(() => void tick(), pollIntervalMs)
      }
    }
  }

  return {
    start(): void {
      if (running || nextTickTimer !== null) return
      logger.info({ pollIntervalMs, batchSize }, 'outbox relay started')
      nextTickTimer = setTimeout(() => void tick(), pollIntervalMs)
    },

    async stop(): Promise<void> {
      stopRequested = true
      if (nextTickTimer !== null) {
        clearTimeout(nextTickTimer)
        nextTickTimer = null
      }
      while (running) {
        await new Promise((resolve) => setTimeout(resolve, 50))
      }
      logger.info('outbox relay stopped')
    },
  }
}
