import { Wallet } from '../domain/wallet.js'
import type { WalletRepository, UnitOfWork } from '../domain/ports.js'
import { TOPICS, buildEnvelope } from '@walletdigital/events'
import type { CreateWalletForMerchantInput, CreateWalletForMerchantOutput } from './create-wallet.dto.js'

// CreateWalletForMerchantUseCase — provisions the wallet attached to a
// merchant in reaction to a `merchant.created` event.
//
// Atomicity: the wallet row AND the `wallet.created` outbox event are
// written in the SAME Postgres transaction via UnitOfWork. The outbox
// relay later publishes to Kafka so downstream services (transaction)
// can react.
//
// Idempotency: Kafka delivery is at-least-once. If the same
// `merchant.created` event is redelivered, we must NOT create a second
// wallet. We check `findByMerchantId(merchantId)` first and rely on the
// UNIQUE (merchantId) constraint as a final safety net (P2002 caught and
// treated as "already done").
export class CreateWalletForMerchantUseCase {
  constructor(
    private readonly wallets: WalletRepository,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(input: CreateWalletForMerchantInput): Promise<CreateWalletForMerchantOutput | null> {
    // Fast path — already provisioned. Cheaper than catching a constraint
    // violation, and it's the most likely case for a redelivered event.
    const existing = await this.wallets.findByMerchantId(input.merchantId)
    if (existing !== null) {
      return null
    }

    const wallet = Wallet.createForMerchant({
      id: crypto.randomUUID(),
      merchantId: input.merchantId,
      currency: input.currency,
    })

    await this.uow.withTransaction(async ({ wallets, outbox }) => {
      try {
        await wallets.save(wallet)
      } catch (err) {
        if (isUniqueViolation(err)) {
          // Race: another consumer / redelivery just created the wallet
          // between findByMerchantId and save. Commit silently so the
          // Kafka offset moves forward.
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
            merchantId: wallet.merchantId,
            currency: wallet.currency,
            balance: wallet.balance.toMinorString(),
            createdAt: wallet.createdAt.toISOString(),
          },
        },
      })
    })

    return {
      walletId: wallet.id,
      merchantId: wallet.merchantId,
      currency: wallet.currency,
      balance: wallet.balance.toMinorString(),
      createdAt: wallet.createdAt.toISOString(),
    }
  }
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && (err as { code: unknown }).code === 'P2002'
}
