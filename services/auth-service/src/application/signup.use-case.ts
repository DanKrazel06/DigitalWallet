import { Email } from '../domain/email.js'
import { PasswordHash } from '../domain/password-hash.js'
import { User } from '../domain/user.js'
import { UserAlreadyExistsError } from '../domain/errors.js'
import type { PasswordHasher, UnitOfWork, UserRepository } from '../domain/ports.js'
import { TOPICS, buildEnvelope } from '@walletdigital/events'
import type { SignupInput, SignupOutput } from './signup.dto.js'

// SignupUseCase — registers a new user.
//
// Kept as a standalone use-case (not a method of AuthService) because it
// owns a transactional concern that the other operations do not share:
// the user row and the outbox event are inserted in the SAME Postgres
// transaction via UnitOfWork. If Kafka is down at signup time the event
// waits in the outbox table and the outbox-relay worker publishes it later.
// No event is ever lost or sent without a user.
export class SignupUseCase {
  constructor(
    // Read-only repo for the pre-check outside the transaction.
    private readonly users: UserRepository,
    private readonly hasher: PasswordHasher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(input: SignupInput): Promise<SignupOutput> {
    // Step 1 — validate and normalize email at the domain boundary.
    const email = Email.create(input.email)

    // Step 2 — reject duplicate signups early to avoid a wasted hash.
    // The DB UNIQUE constraint inside the transaction catches the race
    // where two requests for the same email arrive concurrently.
    const existing = await this.users.findByEmail(email)
    if (existing !== null) {
      throw new UserAlreadyExistsError(email.value)
    }

    // Step 3 — hash password (Argon2id, injected via PasswordHasher port).
    const passwordHash = PasswordHash.fromHashed(await this.hasher.hash(input.password))

    // Step 4 — build the User aggregate inside the domain.
    const user = User.create({
      id: crypto.randomUUID(),
      email,
      passwordHash,
    })

    // Step 5 — persist user + outbox event atomically.
    await this.uow.withTransaction(async ({ users, outbox }) => {
      await users.save(user)
      await outbox.append({
        aggregateId: user.id,
        topic: TOPICS.USER,
        payload: {
          ...buildEnvelope('user.created'),
          payload: {
            userId: user.id,
            email: user.email.value,
            createdAt: user.createdAt.toISOString(),
          },
        },
      })
    })

    return {
      userId: user.id,
      email: user.email.value,
      createdAt: user.createdAt.toISOString(),
    }
  }
}
