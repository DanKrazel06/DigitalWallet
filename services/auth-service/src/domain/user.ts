import { Email } from './email.js'
import { PasswordHash } from './password-hash.js'

// User entity — identified by `id`, with mutable state over time.
// Encapsulates the invariants that a User row must satisfy regardless of
// the storage backend or transport layer.
//
// Construction goes through static factories so that:
//   - `create()`     is used when registering a brand-new user
//   - `rehydrate()`  is used by the repository when loading from DB
// Both keep the domain free of any Prisma/SQL types.
export interface UserProps {
  id: string
  email: Email
  passwordHash: PasswordHash
  createdAt: Date
  updatedAt: Date
}

export class User {
  private constructor(private readonly props: UserProps) {}

  // Factory for a freshly-signed-up user. The caller provides:
  //   - an already-validated Email
  //   - an already-hashed password (PasswordHash from infrastructure)
  //   - a new uuid (typically crypto.randomUUID())
  // Timestamps are stamped here so the domain stays the source of truth.
  static create(input: { id: string; email: Email; passwordHash: PasswordHash }): User {
    const now = new Date()
    return new User({
      id: input.id,
      email: input.email,
      passwordHash: input.passwordHash,
      createdAt: now,
      updatedAt: now,
    })
  }

  // Rebuild a User from persisted state (Prisma row). Used by repositories.
  // No validation here — we trust the DB; if it's corrupted we have bigger
  // problems than catching them at runtime.
  static rehydrate(props: UserProps): User {
    return new User(props)
  }

  get id(): string {
    return this.props.id
  }

  get email(): Email {
    return this.props.email
  }

  get passwordHash(): PasswordHash {
    return this.props.passwordHash
  }

  get createdAt(): Date {
    return this.props.createdAt
  }

  get updatedAt(): Date {
    return this.props.updatedAt
  }

  // Returns a snapshot of the raw values, useful for the repository to
  // map to a Prisma row without exposing private fields.
  toSnapshot(): { id: string; email: string; passwordHash: string; createdAt: Date; updatedAt: Date } {
    return {
      id: this.props.id,
      email: this.props.email.value,
      passwordHash: this.props.passwordHash.value,
      createdAt: this.props.createdAt,
      updatedAt: this.props.updatedAt,
    }
  }
}
