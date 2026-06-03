import { Email } from '../domain/email.js'
import { PasswordHash } from '../domain/password-hash.js'
import { User } from '../domain/user.js'
import { UserAlreadyExistsError } from '../domain/errors.js'
import type { UserRepository } from '../domain/ports.js'
import type { PrismaLike } from './prisma-types.js'

// PrismaUserRepository — concrete implementation of the UserRepository port.
//
// The repository is the ONLY place that knows about the Prisma row shape.
// Use-cases and the rest of the codebase only see domain types (User, Email).
export class PrismaUserRepository implements UserRepository {
  constructor(private readonly prisma: PrismaLike) {}

  async findByEmail(email: Email): Promise<User | null> {
    const row = await this.prisma.user.findUnique({ where: { email: email.value } })
    return row === null ? null : this.toDomain(row)
  }

  async findById(id: string): Promise<User | null> {
    const row = await this.prisma.user.findUnique({ where: { id } })
    return row === null ? null : this.toDomain(row)
  }

  async save(user: User): Promise<void> {
    const snapshot = user.toSnapshot()
    try {
      await this.prisma.user.create({
        data: {
          id: snapshot.id,
          email: snapshot.email,
          passwordHash: snapshot.passwordHash,
          createdAt: snapshot.createdAt,
          updatedAt: snapshot.updatedAt,
        },
      })
    } catch (err) {
      // Translate the Prisma unique-violation code into a domain error so
      // use-cases can react without reaching for Prisma-specific types.
      if (isUniqueViolation(err)) {
        throw new UserAlreadyExistsError(snapshot.email)
      }
      throw err
    }
  }

  // Maps a Prisma row to the domain entity. Re-creates value objects so the
  // rest of the codebase sees fully-validated domain types, not raw strings.
  private toDomain(row: { id: string; email: string; passwordHash: string; createdAt: Date; updatedAt: Date }): User {
    return User.rehydrate({
      id: row.id,
      email: Email.create(row.email),
      passwordHash: PasswordHash.fromHashed(row.passwordHash),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    })
  }
}

// Prisma's unique constraint violation code is `P2002`. Checking the shape
// at runtime avoids importing Prisma's namespaced error class, which is
// awkward to type-narrow.
function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: unknown }).code === 'P2002'
  )
}
