import { WalletNotFoundError } from '../domain/errors.js'
import type { Wallet } from '../domain/wallet.js'
import type { WalletRepository } from '../domain/ports.js'
import type { GetWalletByIdInput, GetWalletsByUserIdInput, WalletDto } from './wallet.dto.js'

// WalletService — read-side operations on wallets.
// Write operations that emit events (creation, freeze/unfreeze, ...) live
// in dedicated UseCase classes because they require UoW + OutboxWriter.
export class WalletService {
  constructor(private readonly wallets: WalletRepository) {}

  // -------------------------------------------------------------------------
  // listByUserId — every wallet attached to a user (one per currency).
  // 200 OK with an array (possibly empty if no wallet has been provisioned
  // yet — for example because the account.created event has not yet been
  // consumed by wallet-service).
  // -------------------------------------------------------------------------
  async listByUserId(input: GetWalletsByUserIdInput): Promise<WalletDto[]> {
    const wallets = await this.wallets.findAllByUserId(input.userId)
    return wallets.map(toDto)
  }

  // -------------------------------------------------------------------------
  // getById — fetch a single wallet by its own id, or 404.
  // -------------------------------------------------------------------------
  async getById(input: GetWalletByIdInput): Promise<WalletDto> {
    const wallet = await this.wallets.findById(input.id)
    if (wallet === null) {
      throw new WalletNotFoundError()
    }
    return toDto(wallet)
  }
}

function toDto(w: Wallet): WalletDto {
  return {
    id: w.id,
    userId: w.userId,
    accountId: w.accountId,
    currency: w.currency,
    balance: w.balance.toMinorString(),
    status: w.status,
    createdAt: w.createdAt.toISOString(),
    updatedAt: w.updatedAt.toISOString(),
  }
}
