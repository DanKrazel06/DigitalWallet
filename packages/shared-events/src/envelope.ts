import { z } from 'zod'

// Common envelope wrapping every event published to Kafka.
// Allows payload evolution via `version` without breaking consumers,
// and end-to-end tracing via `eventId` + `correlationId`.
export const eventEnvelopeSchema = z.object({
  eventId: z.string().uuid(),
  occurredAt: z.string().datetime(),
  type: z.string(),
  version: z.number().int().positive(),
  correlationId: z.string().uuid().optional(),
})

export type EventEnvelope = z.infer<typeof eventEnvelopeSchema>

export function buildEnvelope(type: string, version = 1, correlationId?: string): EventEnvelope {
  return {
    eventId: crypto.randomUUID(),
    occurredAt: new Date().toISOString(),
    type,
    version,
    ...(correlationId ? { correlationId } : {}),
  }
}
