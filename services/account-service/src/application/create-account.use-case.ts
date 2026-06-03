import { Account } from '../domain/account.js'
import type { AccountRepository, UnitOfWork } from '../domain/ports.js'
import { TOPICS, buildEnvelope } from '@walletdigital/events'
import type {
  CreateAccountFromUserInput,
  CreateAccountFromUserOutput,
} from './create-account.dto.js'

// CreateAccountFromUserUseCase — creates a profile in reaction to a
// `user.created` event from auth-service.
//
// Atomic guarantee: the account row AND the `account.created` outbox event
// are written in the SAME Postgres transaction via UnitOfWork. The outbox
// relay later publishes the event to Kafka so notification/wallet/etc.
// react in cascade.
//
// Idempotency: the handler is called from a Kafka consumer using
// at-least-once delivery. If the same `user.created` event is redelivered
// (process crash between handler success and offset commit), we must NOT
// create a duplicate account. We rely on the `userId` UNIQUE constraint
// on the `accounts` table: a duplicate insert triggers a Prisma P2002
// error which we catch and treat as "already done". The handler still
// returns success so the consumer can commit the offset and move on.
export class CreateAccountFromUserUseCase {
  constructor(
    private readonly accounts: AccountRepository,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(input: CreateAccountFromUserInput): Promise<CreateAccountFromUserOutput | null> {
    // Fast path — if the account already exists, skip the write entirely.
    // Cheaper than catching a constraint violation, and it's the most
    // likely case for a redelivered event.
    const existing = await this.accounts.findByUserId(input.userId)
    if (existing !== null) {
      return null
    }

    const account = Account.createFromUser({
      id: crypto.randomUUID(),
      userId: input.userId,
      email: input.email,
    })

    await this.uow.withTransaction(async ({ accounts, outbox }) => {
      try {
        await accounts.save(account)
      } catch (err) {
        // P2002 = unique violation. Means another consumer / a redelivery
        // already created the row between our findByUserId and our save.
        // We swallow the error so the consumer can commit the offset.
        if (isUniqueViolation(err)) {
          return
        }
        throw err
      }

      await outbox.append({
        aggregateId: account.id,
        topic: TOPICS.ACCOUNT,
        payload: {
          ...buildEnvelope('account.created'),
          payload: {
            accountId: account.id,
            userId: account.userId,
            email: account.email,
            kycStatus: account.kycStatus,
            createdAt: account.createdAt.toISOString(),
          },
        },
      })
    })

    return {
      accountId: account.id,
      userId: account.userId,
      email: account.email,
      createdAt: account.createdAt.toISOString(),
    }
  }
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: unknown }).code === 'P2002'
  )
}
