import 'dotenv/config'
import { z } from 'zod'

// Single source of truth for runtime configuration. All env vars are
// validated at startup — missing or malformed values exit the process
// before any HTTP route or Kafka consumer is registered (fail-fast).
const configSchema = z.object({
  HOST: z.string().min(1).default('0.0.0.0'),
  PORT: z.coerce.number().int().positive().default(3002),

  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  DATABASE_URL: z.string().url(),

  KAFKA_BROKERS: z.string().min(1),
  KAFKA_CLIENT_ID: z.string().min(1).default('account-service'),
  KAFKA_CONSUMER_GROUP: z.string().min(1).default('account-service'),
})

export type Config = z.infer<typeof configSchema>

export function loadConfig(): Config {
  const parsed = configSchema.safeParse(process.env)
  if (!parsed.success) {
    console.error('Invalid environment configuration:')
    for (const issue of parsed.error.issues) {
      console.error(`  ${issue.path.join('.')}: ${issue.message}`)
    }
    process.exit(1)
  }
  return parsed.data
}
