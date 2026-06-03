import { Wallet } from '../domain/wallet.js'
import type { WalletRepository, UnitOfWork } from '../domain/ports.js'
import { TOPICS, buildEnvelope } from '@walletdigital/events'
import type {
  CreateWalletFromAccountInput,
  CreateWalletFromAccountOutput,
} from './create-wallet.dto.js'

// CreateWalletFromAccountUseCase — provisions a wallet in reaction to
// an `account.created` event from account-service.
//
// Atomicity: the wallet row AND the `wallet.created` outbox event are
// written in the SAME Postgres transaction via UnitOfWork. The outbox
// relay later publishes to Kafka so downstream services (notification,
// transaction) can react.
//
// Idempotency: Kafka delivery is at-least-once. If the same
// `account.created` event is redelivered, we must NOT create a second
// wallet. We check `findByUserAndCurrency(userId, currency)` first and
// rely on the UNIQUE (userId, currency) constraint as a final safety net
// (P2002 caught and treated as "already done").
export class CreateWalletFromAccountUseCase {
  constructor(
    private readonly wallets: WalletRepository,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(input: CreateWalletFromAccountInput): Promise<CreateWalletFromAccountOutput | null> {
    // Fast path — already provisioned. Cheaper than catching a constraint
    // violation, and it's the most likely case for a redelivered event.
    const existing = await this.wallets.findByUserAndCurrency(input.userId, input.currency)
    if (existing !== null) {
      return null
    }

    const wallet = Wallet.createFromAccount({
      id: crypto.randomUUID(),
      userId: input.userId,
      accountId: input.accountId,
      currency: input.currency,
    })

    await this.uow.withTransaction(async ({ wallets, outbox }) => {
      try {
        await wallets.save(wallet)
      } catch (err) {
        if (isUniqueViolation(err)) {
          // Race condition: another consumer / a redelivery just created
          // the wallet between our findByUserAndCurrency and our save.
          // Treat as success so the Kafka offset can commit.
          return
        }
        throw err
      }

      await outbox.append({
        aggregateId: wallet.id,
        topic: TOPICS.WALLET,
        payload: {
          ...buildEnvelope('wallet.created'),
          payload: {
            walletId: wallet.id,
            userId: wallet.userId,
            accountId: wallet.accountId,
            currency: wallet.currency,
            balance: wallet.balance.toMinorString(),
            createdAt: wallet.createdAt.toISOString(),
          },
        },
      })
    })

    return {
      walletId: wallet.id,
      userId: wallet.userId,
      accountId: wallet.accountId,
      currency: wallet.currency,
      balance: wallet.balance.toMinorString(),
      createdAt: wallet.createdAt.toISOString(),
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
