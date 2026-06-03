import { Account, type KycStatus } from '../domain/account.js'
import type { AccountRepository } from '../domain/ports.js'
import type { PrismaLike } from './prisma-types.js'

// PrismaAccountRepository — concrete implementation of AccountRepository.
//
// The repository is the only place that knows about the Prisma row shape;
// use-cases see only domain types (Account). Accepts either the root
// PrismaClient or a transactional client so it can be used inside UoW.
export class PrismaAccountRepository implements AccountRepository {
  constructor(private readonly prisma: PrismaLike) {}

  async findByUserId(userId: string): Promise<Account | null> {
    const row = await this.prisma.account.findUnique({ where: { userId } })
    return row === null ? null : this.toDomain(row)
  }

  async findById(id: string): Promise<Account | null> {
    const row = await this.prisma.account.findUnique({ where: { id } })
    return row === null ? null : this.toDomain(row)
  }

  async save(account: Account): Promise<void> {
    const snap = account.toSnapshot()
    await this.prisma.account.create({
      data: {
        id: snap.id,
        userId: snap.userId,
        email: snap.email,
        firstName: snap.firstName,
        lastName: snap.lastName,
        kycStatus: snap.kycStatus,
        createdAt: snap.createdAt,
        updatedAt: snap.updatedAt,
      },
    })
  }

  // -------------------------------------------------------------------------
  // toDomain — translate a raw Prisma row into a fully-formed Account
  // domain entity. This is the boundary between the infrastructure and the
  // domain layers:
  //
  //   - Prisma rows are flat, mutable, weakly-typed (kycStatus is a `string`).
  //   - The Account entity has a private constructor, getter-only properties,
  //     a strict KycStatus union type, and the business invariants enforced
  //     by its factories.
  //
  // We rebuild the entity via `Account.rehydrate(...)` (NOT `createFromUser`)
  // because we are loading existing state from storage — not creating a
  // brand-new account. `rehydrate` skips the creation-time checks; we
  // trust what the DB returns. Conversely, when persisting, we use
  // `account.toSnapshot()` to get back to a flat object Prisma can store.
  // -------------------------------------------------------------------------
  private toDomain(row: {
    id: string
    userId: string
    email: string
    firstName: string | null
    lastName: string | null
    kycStatus: string
    createdAt: Date
    updatedAt: Date
  }): Account {
    return Account.rehydrate({
      id: row.id,
      userId: row.userId,
      email: row.email,
      firstName: row.firstName,
      lastName: row.lastName,
      // Narrow the raw DB string to the strict domain union. If a value
      // outside the union appeared in the DB, downstream switch statements
      // would lose exhaustiveness — kept here as a deliberate trust boundary.
      kycStatus: row.kycStatus as KycStatus,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    })
  }
}
