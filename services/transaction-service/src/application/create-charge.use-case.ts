import { TOPICS, buildEnvelope } from '@walletdigital/events'
import { Money } from '../domain/money.js'
import { LedgerEntry } from '../domain/ledger-entry.js'
import { Transaction, type TransactionStatus } from '../domain/transaction.js'
import {
  InsufficientFundsError,
  MerchantInactiveError,
  MerchantNotFoundError,
  SameWalletTransferError,
  WalletInactiveError,
  WalletNotFoundError,
  type DomainError,
} from '../domain/errors.js'
import type { TransactionRepository, UnitOfWork } from '../domain/ports.js'
import type { CreateChargeInput, CreateChargeOutput } from './create-charge.dto.js'

// CreateChargeUseCase — debits a source wallet and credits a destination
// wallet (typically a merchant's wallet) atomically.
//
// Pipeline inside one Postgres transaction:
//   1. Idempotency check via clientRequestId (also outside the tx as a
//      fast path for replays).
//   2. SELECT ... FOR UPDATE on both wallets in a deterministic order
//      (smallest id first) to avoid deadlocks on opposing concurrent
//      transfers.
//   3. Business validations: merchant active, source wallet active,
//      destination wallet active, source ≠ destination, balance >= amount.
//   4. UPDATE balances, INSERT transaction (status=completed), INSERT 2
//      ledger entries (charge debit + charge credit), INSERT outbox event.
//   5. On a validation failure, persist a `declined` Transaction row +
//      a `charge.declined` outbox event so the client can rely on the
//      same idempotency key without retrying side-effects.
export class CreateChargeUseCase {
  constructor(
    // Read-only repo for the pre-flight idempotency lookup outside the
    // main transaction. Cheap, avoids opening a tx for replays.
    private readonly transactionsRead: TransactionRepository,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(input: CreateChargeInput): Promise<CreateChargeOutput> {
    // Fast-path: idempotent replay — return the cached outcome.
    const existing = await this.transactionsRead.findByClientRequestId(input.clientRequestId)
    if (existing !== null) {
      return {
        transactionId: existing.id,
        status: existing.status,
        declineReason: existing.declineReason,
        replayed: true,
      }
    }

    const amount = Money.fromMinor(BigInt(input.amount), input.currency)

    return this.uow.withTransaction(async ({ wallets, merchants, transactions, ledger, outbox }) => {
      // Re-check inside the transaction (covers the race where two
      // concurrent calls with the same key arrive simultaneously).
      const racingExisting = await transactions.findByClientRequestId(input.clientRequestId)
      if (racingExisting !== null) {
        return {
          transactionId: racingExisting.id,
          status: racingExisting.status,
          declineReason: racingExisting.declineReason,
          replayed: true,
        }
      }

      const transactionId = crypto.randomUUID()

      // --- Merchant existence + status ---------------------------------
      const merchant = await merchants.findById(input.merchantId)
      if (merchant === null) {
        throw new MerchantNotFoundError(input.merchantId)
      }

      // Lock both wallets in a deterministic order to avoid deadlocks
      // between two concurrent transfers in opposite directions.
      const [firstId, secondId] =
        input.fromWalletId < input.toWalletId
          ? [input.fromWalletId, input.toWalletId]
          : [input.toWalletId, input.fromWalletId]
      const firstLocked = await wallets.findForUpdateById(firstId)
      const secondLocked = await wallets.findForUpdateById(secondId)
      const fromWallet = firstId === input.fromWalletId ? firstLocked : secondLocked
      const toWallet = firstId === input.fromWalletId ? secondLocked : firstLocked

      if (fromWallet === null) {
        throw new WalletNotFoundError(input.fromWalletId)
      }
      if (toWallet === null) {
        throw new WalletNotFoundError(input.toWalletId)
      }

      // --- Business validations (produce a `declined` audit row) ----------
      const decline = async (reason: string): Promise<CreateChargeOutput> => {
        const declined = Transaction.recordChargeDeclined({
          id: transactionId,
          clientRequestId: input.clientRequestId,
          merchantId: input.merchantId,
          fromWalletId: fromWallet.id,
          toWalletId: toWallet.id,
          amount,
          reason,
        })
        await transactions.insert(declined)
        await outbox.append({
          aggregateId: declined.id,
          topic: TOPICS.TRANSACTION,
          payload: {
            ...buildEnvelope('charge.declined'),
            payload: {
              transactionId: declined.id,
              clientRequestId: declined.clientRequestId,
              merchantId: declined.merchantId,
              fromWalletId: declined.fromWalletId,
              toWalletId: declined.toWalletId,
              amount: declined.amount.toMinorString(),
              currency: declined.amount.currency,
              reason,
              createdAt: declined.createdAt.toISOString(),
            },
          },
        })
        return {
          transactionId: declined.id,
          status: 'declined' as TransactionStatus,
          declineReason: reason,
          replayed: false,
        }
      }

      if (!merchant.isActive()) {
        const err: DomainError = new MerchantInactiveError(merchant.id)
        return decline(err.message)
      }
      if (fromWallet.id === toWallet.id) {
        const err: DomainError = new SameWalletTransferError()
        return decline(err.message)
      }
      if (!fromWallet.isActive()) {
        const err: DomainError = new WalletInactiveError(fromWallet.id)
        return decline(err.message)
      }
      if (!toWallet.isActive()) {
        const err: DomainError = new WalletInactiveError(toWallet.id)
        return decline(err.message)
      }
      if (!fromWallet.balance.greaterThanOrEqual(amount)) {
        const err: DomainError = new InsufficientFundsError()
        return decline(err.message)
      }

      // --- Apply the charge -----------------------------------------------
      const newFrom = fromWallet.applyDebit(amount)
      const newTo = toWallet.applyCredit(amount)
      await wallets.update(newFrom)
      await wallets.update(newTo)

      const completed = Transaction.recordChargeCompleted({
        id: transactionId,
        clientRequestId: input.clientRequestId,
        merchantId: input.merchantId,
        fromWalletId: fromWallet.id,
        toWalletId: toWallet.id,
        amount,
      })
      await transactions.insert(completed)

      const debitEntry = LedgerEntry.chargeDebit({
        id: crypto.randomUUID(),
        transactionId: completed.id,
        walletId: fromWallet.id,
        amount,
        balanceAfter: newFrom.balance,
      })
      const creditEntry = LedgerEntry.chargeCredit({
        id: crypto.randomUUID(),
        transactionId: completed.id,
        walletId: toWallet.id,
        amount,
        balanceAfter: newTo.balance,
      })
      await ledger.insertMany([debitEntry, creditEntry])

      await outbox.append({
        aggregateId: completed.id,
        topic: TOPICS.TRANSACTION,
        payload: {
          ...buildEnvelope('charge.completed'),
          payload: {
            transactionId: completed.id,
            clientRequestId: completed.clientRequestId,
            merchantId: completed.merchantId,
            fromWalletId: completed.fromWalletId,
            toWalletId: completed.toWalletId,
            amount: completed.amount.toMinorString(),
            currency: completed.amount.currency,
            createdAt: completed.createdAt.toISOString(),
          },
        },
      })

      return {
        transactionId: completed.id,
        status: 'completed' as TransactionStatus,
        declineReason: null,
        replayed: false,
      }
    })
  }
}
