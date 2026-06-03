import { Kafka, logLevel, type KafkaConfig } from 'kafkajs'

export interface CreateKafkaClientOptions {
  // Comma-separated list of broker addresses, e.g. "localhost:9092".
  brokers: string[]
  // Identifies this service in Kafka logs and consumer group metadata.
  clientId: string
  // SASL / SSL not configured here — added later when needed in production.
}

// Builds a configured KafkaJS client. Each service should call this once
// at startup and reuse the returned instance for producers and consumers.
export function createKafkaClient(options: CreateKafkaClientOptions): Kafka {
  const config: KafkaConfig = {
    clientId: options.clientId,
    brokers: options.brokers,
    // Avoid noisy kafkajs internals — our own logger handles errors.
    logLevel: logLevel.ERROR,
    // Retry connection attempts with exponential backoff before giving up.
    retry: {
      initialRetryTime: 300,
      retries: 8,
    },
  }
  return new Kafka(config)
}
