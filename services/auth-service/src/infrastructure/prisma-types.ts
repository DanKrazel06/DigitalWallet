import type { PrismaClient } from '../generated/prisma/index.js'

// Subset of PrismaClient methods used by repositories. Compatible with
// both the root client and the transactional client passed by
// `prisma.$transaction(cb)`, so repositories can be reused inside a
// transaction without any extra plumbing.
export type PrismaLike = Omit<PrismaClient, `$${string}`>
