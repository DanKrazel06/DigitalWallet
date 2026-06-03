import { Money } from '../domain/money.js'
import { WalletProjection } from '../domain/wallet-projection.js'
import type { WalletProjectionRepository } from '../domain/ports.js'
import type { ProjectWalletFromCreatedInput } from './project-wallet.dto.js'

// ProjectWalletFromCreatedUseCase — consume a `wallet.created` Kafka
// event and INSERT the matching row into transaction-service's local
// projection table.
//
// Idempotent: Kafka delivery is at-least-once. If the same event is
// redelivered, `findById` returns the existing row and we no-op. The
// repository's INSERT also uses the wallet-service-issued id as primary
// key, so a duplicate would be caught by Postgres' unique constraint as
// a safety net.
export class ProjectWalletFromCreatedUseCase {
  constructor(private readonly wallets: WalletProjectionRepository) {}

  async execute(input: ProjectWalletFromCreatedInput): Promise<{ created: boolean }> {
    const existing = await this.wallets.findById(input.walletId)
    if (existing !== null) {
      return { created: false }
    }

    const projection = WalletProjection.fromCreatedEvent({
      id: input.walletId,
      userId: input.userId,
      balance: Money.fromMinor(BigInt(input.balance), input.currency),
    })

    try {
      await this.wallets.insert(projection)
    } catch (err) {
      // Race against another redelivery of the same event — treat as
      // success so the Kafka offset can commit.
      if (isUniqueViolation(err)) {
        return { created: false }
      }
      throw err
    }

    return { created: true }
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
