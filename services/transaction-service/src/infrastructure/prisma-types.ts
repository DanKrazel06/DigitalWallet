import type { PrismaClient } from '../generated/prisma/index.js'

// Subset of PrismaClient usable both as the root client and as the
// transactional client passed by `prisma.$transaction(cb)`. We strip the
// connection-management `$` methods that don't exist on the tx client,
// but keep `$queryRawUnsafe` because raw SQL (e.g. SELECT ... FOR UPDATE)
// IS available inside a transaction and we need it for row locking.
export type PrismaLike = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>
