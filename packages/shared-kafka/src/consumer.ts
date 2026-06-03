import type { Kafka, Consumer, EachMessagePayload } from 'kafkajs'
import type { ZodTypeAny, z } from 'zod'
import type { Topic } from '@walletdigital/events'
import type { Logger } from '@walletdigital/logger'

// Handler invoked for every successfully parsed event. The schema's inferred
// type ensures the handler receives a fully-typed, validated event.
export type EventHandler<Schema extends ZodTypeAny> = (event: z.infer<Schema>) => Promise<void>

export interface EventSubscription<Schema extends ZodTypeAny> {
  topic: Topic
  schema: Schema
  handler: EventHandler<Schema>
}

export interface EventConsumer {
  // Starts consuming. Blocks until `disconnect()` is called.
  run(): Promise<void>
  // Gracefully leaves the consumer group and closes the connection.
  disconnect(): Promise<void>
}

export interface CreateEventConsumerOptions<Schema extends ZodTypeAny> {
  kafka: Kafka
  logger: Logger
  // Consumer group id. All instances sharing this id load-balance partitions
  // between themselves. Use the service name (e.g. "wallet-service").
  groupId: string
  subscription: EventSubscription<Schema>
}

export async function createEventConsumer<Schema extends ZodTypeAny>(
  options: CreateEventConsumerOptions<Schema>,
): Promise<EventConsumer> {
  const { kafka, logger, groupId, subscription } = options

  const consumer: Consumer = kafka.consumer({
    groupId,
    // Read from the earliest available offset on first connection.
    // On subsequent runs, Kafka resumes from the committed offset.
    sessionTimeout: 30_000,
    heartbeatInterval: 3_000,
  })

  await consumer.connect()
  await consumer.subscribe({ topic: subscription.topic, fromBeginning: false })
  logger.info({ topic: subscription.topic, groupId }, 'kafka consumer subscribed')

  return {
    async run() {
      await consumer.run({
        // eachMessage processes messages one by one. KafkaJS auto-commits the
        // offset only AFTER the handler resolves — if it throws, the message
        // will be redelivered after a restart. This is "at-least-once" delivery.
        eachMessage: async (payload: EachMessagePayload) => {
          const { message, topic, partition } = payload
          const rawValue = message.value?.toString('utf-8')
          if (!rawValue) {
            logger.warn({ topic, partition, offset: message.offset }, 'empty kafka message skipped')
            return
          }

          let parsedJson: unknown
          try {
            parsedJson = JSON.parse(rawValue)
          } catch (err) {
            // Poison message: unparseable JSON. Log and skip to avoid an
            // infinite retry loop. In production, route to a dead-letter topic.
            logger.error({ err, topic, partition, offset: message.offset }, 'invalid JSON in kafka message')
            return
          }

          const result = subscription.schema.safeParse(parsedJson)
          if (!result.success) {
            // Schema violation: message does not match the expected contract.
            // Same reasoning as above — skip rather than crash the consumer.
            logger.error(
              { topic, partition, offset: message.offset, issues: result.error.issues },
              'kafka message failed schema validation',
            )
            return
          }

          try {
            await subscription.handler(result.data as z.infer<Schema>)
          } catch (err) {
            // Re-throw so KafkaJS does NOT commit the offset — the message
            // will be redelivered. Upstream code is responsible for
            // idempotency (e.g. checking if the entity already exists).
            logger.error({ err, topic, partition, offset: message.offset }, 'event handler failed')
            throw err
          }
        },
      })
    },

    async disconnect() {
      await consumer.disconnect()
      logger.info({ groupId, topic: subscription.topic }, 'kafka consumer disconnected')
    },
  }
}
