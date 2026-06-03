import 'dotenv/config'
import { z } from 'zod'

const configSchema = z.object({
  HOST: z.string().min(1).default('0.0.0.0'),
  PORT: z.coerce.number().int().positive().default(3004),

  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  DATABASE_URL: z.string().url(),

  KAFKA_BROKERS: z.string().min(1),
  KAFKA_CLIENT_ID: z.string().min(1).default('transaction-service'),
  KAFKA_CONSUMER_GROUP: z.string().min(1).default('transaction-service'),
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
