// ===========================================================================
// Currency — single source of truth for the currencies WalletDigital
// supports across every service.
//
// Mono-currency for now (USD only). Tuple kept as `as const` so adding a
// second currency later is a one-line change that TypeScript propagates
// to every consumer automatically.
// ===========================================================================
export const SUPPORTED_CURRENCIES = ['USD'] as const

export type Currency = (typeof SUPPORTED_CURRENCIES)[number]

export function isCurrency(raw: string): raw is Currency {
  return (SUPPORTED_CURRENCIES as readonly string[]).includes(raw)
}

// Narrow a string to a Currency, or throw. Useful at adapter boundaries
// (Prisma row → domain) where the input is a plain string.
export function assertCurrency(raw: string): Currency {
  if (!isCurrency(raw)) {
    throw new Error(`Unsupported currency: "${raw}"`)
  }
  return raw
}
