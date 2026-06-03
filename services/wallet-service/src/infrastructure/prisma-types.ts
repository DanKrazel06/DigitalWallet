import type { PrismaClient } from '../generated/prisma/index.js'

// Subset of PrismaClient compatible with both the root client and the
// transactional client passed by `prisma.$transaction(cb)`.
export type PrismaLike = Omit<PrismaClient, `$${string}`>
