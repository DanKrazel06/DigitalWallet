import type { TransactionalPorts, UnitOfWork } from '../../src/domain/ports.js'
import type { InMemoryWalletProjectionRepository } from './in-memory-wallet-projection.repository.js'
import type { InMemoryMerchantProjectionRepository } from './in-memory-merchant-projection.repository.js'
import type { InMemoryTransactionRepository } from './in-memory-transaction.repository.js'
import type { InMemoryLedgerRepository } from './in-memory-ledger.repository.js'
import type { InMemoryOutboxWriter } from './in-memory-outbox.writer.js'

// InMemoryUnitOfWork — wraps the in-memory repositories and exposes them
// to the use-case's transactional callback.
//
// No transaction semantics: if the callback throws, the in-memory state
// is NOT rolled back. Unit tests should assert on the OUTCOME of a
// single happy-path execution; rollback testing belongs in integration
// tests against a real Postgres.
export class InMemoryUnitOfWork implements UnitOfWork {
  constructor(
    private readonly wallets: InMemoryWalletProjectionRepository,
    private readonly merchants: InMemoryMerchantProjectionRepository,
    private readonly transactions: InMemoryTransactionRepository,
    private readonly ledger: InMemoryLedgerRepository,
    private readonly outbox: InMemoryOutboxWriter,
  ) {}

  async withTransaction<T>(work: (ports: TransactionalPorts) => Promise<T>): Promise<T> {
    const ports: TransactionalPorts = {
      wallets: this.wallets,
      merchants: this.merchants,
      transactions: this.transactions,
      ledger: this.ledger,
      outbox: this.outbox,
    }
    return work(ports)
  }
}
