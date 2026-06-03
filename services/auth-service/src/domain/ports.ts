import type { User } from './user.js'
import type { Email } from './email.js'

// ===========================================================================
// PORTS — interfaces declared by the domain, implemented by infrastructure.
//
// Use-cases depend on these abstractions only. This makes the business logic
// testable (we can swap in-memory fakes in unit tests) and replaceable
// (Prisma can be swapped for Drizzle without touching use-cases).
// ===========================================================================

// ---------------------------------------------------------------------------
// UserRepository — persistence boundary for the User aggregate.
// Implementation lives in infrastructure/ (PrismaUserRepository).
// ---------------------------------------------------------------------------
export interface UserRepository {
  // Returns null when no user matches — use-cases decide what that means
  // (signup: free; login: invalid credentials). Never throws on "not found".
  findByEmail(email: Email): Promise<User | null>
  findById(id: string): Promise<User | null>

  // Persists a newly-created User. May throw UserAlreadyExistsError if the
  // email collides (race condition between two concurrent signups).
  save(user: User): Promise<void>
}

// ---------------------------------------------------------------------------
// PasswordHasher — abstracts the hashing algorithm (Argon2id).
// Keeping it behind a port lets us migrate to another algorithm later
// without rewriting use-cases.
// ---------------------------------------------------------------------------
export interface PasswordHasher {
  hash(plaintext: string): Promise<string>
  verify(plaintext: string, hashed: string): Promise<boolean>
}

// ---------------------------------------------------------------------------
// TokenService — issues short-lived access JWTs.
// Refresh tokens are handled by RefreshTokenStore (different lifetime,
// different storage — Redis instead of stateless JWT).
// ---------------------------------------------------------------------------
export interface AccessTokenPayload {
  sub: string
  email: string
}

export interface TokenService {
  signAccessToken(payload: AccessTokenPayload): Promise<string>
  verifyAccessToken(token: string): Promise<AccessTokenPayload>
}

// ---------------------------------------------------------------------------
// RefreshTokenStore — persists opaque refresh tokens with TTL.
// Backed by Redis so revocation (logout) is O(1) and TTL is native.
// ---------------------------------------------------------------------------
export interface RefreshTokenStore {
  // Stores a refresh token and binds it to a userId. Returns the opaque
  // token string the client must present on /refresh.
  issue(userId: string): Promise<string>
  // Resolves a refresh token to its owner, or null if expired/revoked/unknown.
  resolve(token: string): Promise<{ userId: string } | null>
  // Atomic rotation: invalidate the old token and issue a new one.
  // Prevents replay attacks if a refresh token is leaked.
  rotate(oldToken: string): Promise<{ userId: string; newToken: string } | null>
  // Invalidate a refresh token (logout).
  revoke(token: string): Promise<void>
}

// ---------------------------------------------------------------------------
// OutboxWriter — appends an event to the outbox table inside the SAME DB
// transaction as the business write. Implementations receive the Prisma
// transaction client (via UnitOfWork below) to honour atomicity.
// ---------------------------------------------------------------------------
export interface OutboxWriter {
  append(input: {
    aggregateId: string
    topic: string
    payload: unknown
  }): Promise<void>
}

// ---------------------------------------------------------------------------
// UnitOfWork — runs a block of work inside a single DB transaction.
// Use-cases call `withTransaction(async (tx) => { ... })` to perform
// multiple repository writes atomically — typically the business write
// plus an outbox event for the Transactional Outbox pattern.
//
// `tx` is a scoped object exposing transactional versions of every port
// that participates in the unit of work.
// ---------------------------------------------------------------------------
export interface TransactionalPorts {
  users: UserRepository
  outbox: OutboxWriter
}

export interface UnitOfWork {
  withTransaction<T>(work: (ports: TransactionalPorts) => Promise<T>): Promise<T>
}
