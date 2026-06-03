import 'dotenv/config'
import { z } from 'zod'

// Single source of truth for runtime configuration.
// All env vars are parsed and validated here at startup — missing or
// malformed values cause the process to exit before any HTTP route is
// registered. This is the "fail-fast" principle.
const configSchema = z.object({
  // HTTP server
  HOST: z.string().min(1).default('0.0.0.0'),
  PORT: z.coerce.number().int().positive().default(3001),

  // Runtime mode
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  // Dependencies
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  KAFKA_BROKERS: z.string().min(1),
  KAFKA_CLIENT_ID: z.string().min(1).default('auth-service'),

  // JWT — access tokens are short-lived .
  // (default 15 min) and stateless.
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 chars'),
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  JWT_ISSUER: z.string().default('walletdigital'),
  JWT_AUDIENCE: z.string().default('walletdigital-api'),

  // Refresh tokens are opaque random strings stored in Redis.
  REFRESH_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(2_592_000), // 30 days
})

export type Config = z.infer<typeof configSchema>

export function loadConfig(): Config {
  const parsed = configSchema.safeParse(process.env)
  if (!parsed.success) {
    // Print every offending field at once for easier ops debugging.
    console.error('Invalid environment configuration:')
    for (const issue of parsed.error.issues) {
      console.error(`  ${issue.path.join('.')}: ${issue.message}`)
    }
    process.exit(1)
  }
  return parsed.data
}
