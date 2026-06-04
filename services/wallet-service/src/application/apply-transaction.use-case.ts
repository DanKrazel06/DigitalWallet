import { Money } from '../domain/money.js'
import type { WalletRepository } from '../domain/ports.js'
import type { ApplyTransactionInput } from './apply-transaction.dto.js'

// ApplyTransactionToWalletsUseCase — mirrors a charge or refund onto the
// local wallet-service projections.
//
// Direction: the source wallet (`fromWalletId`) is debited and the
// destination wallet (`toWalletId`) is credited. The same semantics
// apply for both charges and refunds: refunds simply have the wallets
// swapped relative to the original charge.
//
// Idempotency: at-least-once Kafka delivery means an event may be
// redelivered. transaction-service is already the source of truth (it
// has the ledger). wallet-service here just MIRRORS. The risk on
// redelivery is double-applying the same movement, which would corrupt
// the displayed balance.
//
// Mitigation in this milestone: we accept the at-least-once risk and
// document it. A robust fix would store the processed transactionId in a
// dedupe table (or in Redis) before applying — left out for brevity, but
// the use-case structure leaves room to add that check.
export class ApplyTransactionToWalletsUseCase {
  constructor(private readonly wallets: WalletRepository) {}

  async execute(input: ApplyTransactionInput): Promise<void> {
    const amount = Money.fromMinor(BigInt(input.amount), input.currency)

    const fromWallet = await this.wallets.findById(input.fromWalletId)
    if (fromWallet !== null) {
      await this.wallets.save(fromWallet.applyDebit(amount))
    }

    const toWallet = await this.wallets.findById(input.toWalletId)
    if (toWallet !== null) {
      await this.wallets.save(toWallet.applyCredit(amount))
    }
  }
}
