// Public API of @walletdigital/prisma — shared utilities to wire Prisma
// into a microservice without rewriting the same plumbing every time.
//
// Note: this package does NOT export a PrismaClient. Each service
// generates its own from its own schema (database-per-service principle).
export * from './types.js'
export * from './outbox-relay.js'
