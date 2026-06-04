import type { OutboxWriter } from '../../src/domain/ports.js'

// InMemoryOutboxWriter — captures all events the use-case attempted to
// publish. Tests assert on `entries` to verify the right events were
// produced.
export interface CapturedOutboxEntry {
  aggregateId: string
  topic: string
  payload: unknown
}

export class InMemoryOutboxWriter implements OutboxWriter {
  readonly entries: CapturedOutboxEntry[] = []

  async append(input: { aggregateId: string; topic: string; payload: unknown }): Promise<void> {
    this.entries.push({
      aggregateId: input.aggregateId,
      topic: input.topic,
      payload: input.payload,
    })
  }

  // Test helper: every event type collected so far.
  // Walks the captured payloads' top-level `type` field (set by buildEnvelope).
  eventTypes(): string[] {
    return this.entries.map((e) => {
      const payload = e.payload as { type?: string }
      return payload.type ?? 'unknown'
    })
  }
}
