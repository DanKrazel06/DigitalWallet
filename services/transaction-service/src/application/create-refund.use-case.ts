import { TOPICS, buildEnvelope } from '@walletdigital/events'
import { Money } from '../domain/money.js'
import { LedgerEntry } from '../domain/ledger-entry.js'
import { Transaction, type TransactionStatus } from '../domain/transaction.js'
import {
  MerchantInactiveError,
  MerchantNotFoundError,
  OriginalTransactionNotChargeError,
  OriginalTransactionNotCompletedError,
  OriginalTransactionNotFoundError,
  RefundExceedsChargeError,
  WalletInactiveError,
  WalletNotFoundError,
  type DomainError,
} from '../domain/errors.js'
import type { TransactionRepository, UnitOfWork } from '../domain/ports.js'
import type { CreateRefundInput, CreateRefundOutput } from './create-refund.dto.js'

// CreateRefundUseCase — reverses a previous charge.
//
// The refund debits the merchant wallet (the original `toWalletId`) and
// credits the original payer wallet (the original `fromWalletId`).
//
// Atomic guarantees:
//   - Idempotency on clientRequestId.
//   - Reject if original transaction is missing, not a `charge`, or not
//     `completed`.
//   - Reject if amount (or default original amount) > original amount.
//     For this milestone a charge can be refunded at most ONCE total.
//   - Atomic UPDATE of both wallets, INSERT Transaction(type=refund),
//     INSERT 2 refund ledger entries, INSERT outbox event.
export class CreateRefundUseCase {
  constructor(
    private readonly transactionsRead: TransactionRepository,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(input: CreateRefundInput): Promise<CreateRefundOutput> {
    // Fast-path: idempotent replay.
    const existing = await this.transactionsRead.findByClientRequestId(input.clientRequestId)
    if (existing !== null) {
      return {
        transactionId: existing.id,
        originalTransactionId: existing.originalTransactionId ?? input.originalTransactionId,
        status: existing.status,
        declineReason: existing.declineReason,
        replayed: true,
      }
    }

    return this.uow.withTransaction(async ({ wallets, merchants, transactions, ledger, outbox }) => {
      // Re-check inside the transaction.
      const racingExisting = await transactions.findByClientRequestId(input.clientRequestId)
      if (racingExisting !== null) {
        return {
          transactionId: racingExisting.id,
          originalTransactionId: racingExisting.originalTransactionId ?? input.originalTransactionId,
          status: racingExisting.status,
          declineReason: racingExisting.declineReason,
          replayed: true,
        }
      }

      const transactionId = crypto.randomUUID()
      // Helper to persist a declined refund + emit the failure event.
      // Used for every business rejection below.
      const decline = async (
        reason: string,
        fromWalletId: string,
        toWalletId: string,
        amount: Money,
      ): Promise<CreateRefundOutput> => {
        const declined = Transaction.recordRefundDeclined({
          id: transactionId,
          clientRequestId: input.clientRequestId,
          originalTransactionId: input.originalTransactionId,
          merchantId: input.merchantId,
          fromWalletId,
          toWalletId,
          amount,
          reason,
        })
        await transactions.insert(declined)
        await outbox.append({
          aggregateId: declined.id,
          topic: TOPICS.TRANSACTION,
          payload: {
            ...buildEnvelope('refund.declined'),
            payload: {
              transactionId: declined.id,
              clientRequestId: declined.clientRequestId,
              originalTransactionId: declined.originalTransactionId,
              merchantId: declined.merchantId,
              amount: declined.amount.toMinorString(),
              currency: declined.amount.currency,
              reason,
              createdAt: declined.createdAt.toISOString(),
            },
          },
        })
        return {
          transactionId: declined.id,
          originalTransactionId: input.originalTransactionId,
          status: 'declined' as TransactionStatus,
          declineReason: reason,
          replayed: false,
        }
      }

      // --- Load + validate original transaction ----------------------
      const original = await transactions.findById(input.originalTransactionId)
      if (original === null) {
        // No original tx: we can't infer wallets to record a meaningful
        // declined row. Throw — HTTP layer maps to 404.
        throw new OriginalTransactionNotFoundError(input.originalTransactionId)
      }
      if (!original.isCharge()) {
        throw new OriginalTransactionNotChargeError(original.id, original.type)
      }
      if (!original.isCompleted()) {
        throw new OriginalTransactionNotCompletedError(original.id)
      }

      // Refund flips the wallets: debit the merchant (original.toWalletId),
      // credit the original payer (original.fromWalletId).
      const refundFromWalletId = original.toWalletId
      const refundToWalletId = original.fromWalletId

      // Amount: default to full original amount when omitted.
      const amount =
        input.amount !== undefined ? Money.fromMinor(BigInt(input.amount), input.currency) : original.amount

      // Refund cannot exceed the original amount (no partial-multiple
      // refunds in this milestone).
      if (!original.amount.greaterThanOrEqual(amount)) {
        const err: DomainError = new RefundExceedsChargeError()
        return decline(err.message, refundFromWalletId, refundToWalletId, amount)
      }

      // --- Merchant + wallets ---------------------------------------
      const merchant = await merchants.findById(input.merchantId)
      if (merchant === null) {
        throw new MerchantNotFoundError(input.merchantId)
      }

      const [firstId, secondId] =
        refundFromWalletId < refundToWalletId
          ? [refundFromWalletId, refundToWalletId]
          : [refundToWalletId, refundFromWalletId]
      const firstLocked = await wallets.findForUpdateById(firstId)
      const secondLocked = await wallets.findForUpdateById(secondId)
      const fromWallet = firstId === refundFromWalletId ? firstLocked : secondLocked
      const toWallet = firstId === refundFromWalletId ? secondLocked : firstLocked

      if (fromWallet === null) {
        throw new WalletNotFoundError(refundFromWalletId)
      }
      if (toWallet === null) {
        throw new WalletNotFoundError(refundToWalletId)
      }

      if (!merchant.isActive()) {
        const err: DomainError = new MerchantInactiveError(merchant.id)
        return decline(err.message, refundFromWalletId, refundToWalletId, amount)
      }
      if (!fromWallet.isActive()) {
        const err: DomainError = new WalletInactiveError(fromWallet.id)
        return decline(err.message, refundFromWalletId, refundToWalletId, amount)
      }
      if (!toWallet.isActive()) {
        const err: DomainError = new WalletInactiveError(toWallet.id)
        return decline(err.message, refundFromWalletId, refundToWalletId, amount)
      }
      // The merchant wallet must hold enough funds to refund. In a real
      // system you'd probably allow negative merchant balance, but for
      // this milestone we reject — keeps the ledger non-negative.
      if (!fromWallet.balance.greaterThanOrEqual(amount)) {
        const err: DomainError = new RefundExceedsChargeError()
        return decline(err.message, refundFromWalletId, refundToWalletId, amount)
      }

      // --- Apply the refund ----------------------------------------
      const newFrom = fromWallet.applyDebit(amount)
      const newTo = toWallet.applyCredit(amount)
      await wallets.update(newFrom)
      await wallets.update(newTo)

      const completed = Transaction.recordRefundCompleted({
        id: transactionId,
        clientRequestId: input.clientRequestId,
        originalTransactionId: original.id,
        merchantId: input.merchantId,
        fromWalletId: fromWallet.id,
        toWalletId: toWallet.id,
        amount,
      })
      await transactions.insert(completed)

      const debitEntry = LedgerEntry.refundDebit({
        id: crypto.randomUUID(),
        transactionId: completed.id,
        walletId: fromWallet.id,
        amount,
        balanceAfter: newFrom.balance,
      })
      const creditEntry = LedgerEntry.refundCredit({
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
          ...buildEnvelope('refund.completed'),
          payload: {
            transactionId: completed.id,
            clientRequestId: completed.clientRequestId,
            originalTransactionId: original.id,
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
        originalTransactionId: original.id,
        status: 'completed' as TransactionStatus,
        declineReason: null,
        replayed: false,
      }
    })
  }
}
