import type { Kafka, Producer } from 'kafkajs'
import type { Topic, EventEnvelope } from '@walletdigital/events'
import type { Logger } from '@walletdigital/logger'

// Any event published to Kafka must carry the standard envelope fields.
// `payload` shape is service-specific and validated by per-event Zod schemas
// from @walletdigital/events before being passed here.
export type PublishableEvent = EventEnvelope & { payload: unknown }

export interface EventPublisher {
  // Publishes a single event. `key` controls partition assignment — pass
  // the entity id (userId, walletId, ...) to keep per-entity ordering.
  publish(topic: Topic, key: string, event: PublishableEvent): Promise<void>
  // Gracefully closes the underlying producer. Call during service shutdown.
  disconnect(): Promise<void>
}

export interface CreateEventPublisherOptions {
  kafka: Kafka
  logger: Logger
}

export async function createEventPublisher(options: CreateEventPublisherOptions): Promise<EventPublisher> {
  const { kafka, logger } = options

  const producer: Producer = kafka.producer({
    // Disable broker-side topic auto-creation: topics must be declared
    // explicitly via infra (rpk / IaC). Prevents silent typos creating
    // ghost topics in production.
    allowAutoTopicCreation: false,

    // Idempotent mode forces acks=all and enables broker-side deduplication
    // on retries (each message gets a sequence number). Mandatory for
    // money-related topics; the overhead is negligible on Redpanda.
    idempotent: true,

    // Number of unacknowledged requests the producer can have in-flight per
    // broker connection. Higher = better throughput via pipelining, but
    // higher risk of reordering on retries WITHOUT idempotence.
    // With idempotent=true, Kafka preserves order even up to 5 in-flight
    // requests — this is the standard production sweet spot.
    maxInFlightRequests: 5,
  })

  await producer.connect()
  logger.info('kafka producer connected')

  return {
    async publish(topic, key, event) {
      const value = JSON.stringify(event)
      await producer.send({
        topic,
        messages: [
          {
            key,
            value,
            // Headers are key/value metadata travelling alongside the payload.
            // They let consumers route or filter without parsing the body.
            headers: {
              'event-type': event.type,
              'event-id': event.eventId,
              ...(event.correlationId ? { 'correlation-id': event.correlationId } : {}),
            },
          },
        ],
      })
      logger.debug({ topic, eventType: event.type, eventId: event.eventId, key }, 'event published')
    },

    async disconnect() {
      await producer.disconnect()
      logger.info('kafka producer disconnected')
    },
  }
}
