import { TOPICS, buildEnvelope } from '@walletdigital/events'
import { Money } from '../domain/money.js'
import { LedgerEntry } from '../domain/ledger-entry.js'
import { Transaction, type TransactionStatus } from '../domain/transaction.js'
import {
  InsufficientFundsError,
  SameWalletTransferError,
  WalletFrozenError,
  WalletNotFoundError,
  type DomainError,
} from '../domain/errors.js'
import type {
  TransactionRepository,
  UnitOfWork,
} from '../domain/ports.js'
import type { CreateTransferInput, CreateTransferOutput } from './create-transfer.dto.js'

// CreateTransferUseCase — the heart of transaction-service.
//
// Runs the entire transfer inside ONE Postgres transaction:
//   - Idempotency check (return early if the key was seen before)
//   - Pessimistic lock (`SELECT ... FOR UPDATE`) on both wallet rows so
//     two concurrent transfers from the same wallet can't both succeed
//   - Business validations (same wallet, frozen, insufficient funds)
//   - Debit + credit on the local projection
//   - INSERT transaction + 2 ledger entries
//   - INSERT outbox event (transaction.completed or transaction.failed)
//   - COMMIT
//
// Failure cases produce a PERSISTED `failed` transaction row so the same
// idempotency key cannot be reused for a different attempt, and so the
// audit trail is complete. The use-case still THROWS the domain error so
// the HTTP layer can return 4xx; the row + outbox happen inside the same
// transaction that's rolled back when we throw — except for the audit
// case where we commit a `failed` row deliberately (see code below).
export class CreateTransferUseCase {
  constructor(
    // Read-only repository for the pre-flight idempotency lookup outside
    // the main transaction. Cheap, avoids opening a tx for replays.
    private readonly transactionsRead: TransactionRepository,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(input: CreateTransferInput): Promise<CreateTransferOutput> {
    // --- Fast-path: idempotent replay --------------------------------------
    // If we've already seen this idempotency key, return the stored result.
    // No transaction, no Kafka publish — just the cached outcome.
    const existing = await this.transactionsRead.findByIdempotencyKey(input.idempotencyKey)
    if (existing !== null) {
      return {
        transactionId: existing.id,
        status: existing.status,
        failureReason: existing.failureReason,
        replayed: true,
      }
    }

    const amount = Money.fromMinor(BigInt(input.amount), input.currency)

    // --- Main path: do the transfer inside one PG transaction -------------
    return this.uow.withTransaction(async ({ wallets, transactions, ledger, outbox }) => {
      // Re-check inside the transaction (covers the case where two
      // concurrent calls with the same key arrive simultaneously).
      const racingExisting = await transactions.findByIdempotencyKey(input.idempotencyKey)
      if (racingExisting !== null) {
        return {
          transactionId: racingExisting.id,
          status: racingExisting.status,
          failureReason: racingExisting.failureReason,
          replayed: true,
        }
      }

      // Acquire row locks on BOTH wallets so concurrent transfers from
      // the same source can't race past the balance check. Lock in a
      // deterministic order (by userId string) to avoid deadlocks when
      // two transfers happen in opposite directions at the same time.
      const [firstUserId, secondUserId] =
        input.fromUserId < input.toUserId
          ? [input.fromUserId, input.toUserId]
          : [input.toUserId, input.fromUserId]
      const firstLocked = await wallets.findForUpdateByUserId(firstUserId)
      const secondLocked = await wallets.findForUpdateByUserId(secondUserId)

      const fromWallet = firstUserId === input.fromUserId ? firstLocked : secondLocked
      const toWallet = firstUserId === input.fromUserId ? secondLocked : firstLocked

      // Wallet existence — either user has not been projected yet (event
      // not consumed) or the userId is bogus. Surface 404, no audit row.
      if (fromWallet === null) {
        throw new WalletNotFoundError(input.fromUserId)
      }
      if (toWallet === null) {
        throw new WalletNotFoundError(input.toUserId)
      }

      // Pre-build a transaction id used by both the success and failure
      // record paths below.
      const transactionId = crypto.randomUUID()

      // --- Business validations (produce auditable failed rows) ----------
      const fail = async (reason: string): Promise<CreateTransferOutput> => {
        const failed = Transaction.recordFailed({
          id: transactionId,
          idempotencyKey: input.idempotencyKey,
          fromWalletId: fromWallet.id,
          toWalletId: toWallet.id,
          fromUserId: input.fromUserId,
          toUserId: input.toUserId,
          amount,
          reason,
        })
        await transactions.insert(failed)
        await outbox.append({
          aggregateId: failed.id,
          topic: TOPICS.TRANSACTION,
          payload: {
            ...buildEnvelope('transaction.failed'),
            payload: {
              transactionId: failed.id,
              idempotencyKey: failed.idempotencyKey,
              fromUserId: failed.fromUserId,
              toUserId: failed.toUserId,
              amount: failed.amount.toMinorString(),
              currency: failed.amount.currency,
              reason,
              createdAt: failed.createdAt.toISOString(),
            },
          },
        })
        // No throw — the row + event commit so the idempotency key is
        // burned. The HTTP layer maps `failed` status to 422.
        return {
          transactionId: failed.id,
          status: 'failed' as TransactionStatus,
          failureReason: reason,
          replayed: false,
        }
      }

      if (fromWallet.id === toWallet.id) {
        const err: DomainError = new SameWalletTransferError()
        return fail(err.message)
      }
      if (!fromWallet.isActive()) {
        const err: DomainError = new WalletFrozenError(fromWallet.id)
        return fail(err.message)
      }
      if (!toWallet.isActive()) {
        const err: DomainError = new WalletFrozenError(toWallet.id)
        return fail(err.message)
      }
      if (!fromWallet.balance.greaterThanOrEqual(amount)) {
        const err: DomainError = new InsufficientFundsError()
        return fail(err.message)
      }

      // --- Apply the transfer ------------------------------------------
      const newFrom = fromWallet.applyDebit(amount)
      const newTo = toWallet.applyCredit(amount)
      await wallets.update(newFrom)
      await wallets.update(newTo)

      const completed = Transaction.recordCompleted({
        id: transactionId,
        idempotencyKey: input.idempotencyKey,
        fromWalletId: fromWallet.id,
        toWalletId: toWallet.id,
        fromUserId: input.fromUserId,
        toUserId: input.toUserId,
        amount,
      })
      await transactions.insert(completed)

      const debitEntry = LedgerEntry.debit({
        id: crypto.randomUUID(),
        transactionId: completed.id,
        walletId: fromWallet.id,
        amount,
        balanceAfter: newFrom.balance,
      })
      const creditEntry = LedgerEntry.credit({
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
          ...buildEnvelope('transaction.completed'),
          payload: {
            transactionId: completed.id,
            idempotencyKey: completed.idempotencyKey,
            fromUserId: completed.fromUserId,
            toUserId: completed.toUserId,
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
        failureReason: null,
        replayed: false,
      }
    })
  }
}
