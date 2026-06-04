import { WalletNotFoundError } from '../domain/errors.js'
import type { Wallet } from '../domain/wallet.js'
import type { WalletRepository } from '../domain/ports.js'
import type { GetWalletByIdInput, GetWalletByMerchantInput, WalletDto } from './wallet.dto.js'

// WalletService — read-side operations on wallets.
// Write operations that emit events (creation, status change) live in
// dedicated UseCase classes because they require UoW + OutboxWriter.
export class WalletService {
  constructor(private readonly wallets: WalletRepository) {}

  // -------------------------------------------------------------------------
  // getByMerchantId — fetch the wallet belonging to a merchant, or 404.
  // -------------------------------------------------------------------------
  async getByMerchantId(input: GetWalletByMerchantInput): Promise<WalletDto> {
    const wallet = await this.wallets.findByMerchantId(input.merchantId)
    if (wallet === null) {
      throw new WalletNotFoundError()
    }
    return toDto(wallet)
  }

  // -------------------------------------------------------------------------
  // getById — fetch a wallet by its own id, or 404.
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
    merchantId: w.merchantId,
    currency: w.currency,
    balance: w.balance.toMinorString(),
    status: w.status,
    createdAt: w.createdAt.toISOString(),
    updatedAt: w.updatedAt.toISOString(),
  }
}
