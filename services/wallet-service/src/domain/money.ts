// Re-export the centralised Money / Currency types from the shared
// package. Kept as a thin file here so the rest of the service still
// imports money via `../domain/money.js` (domain stays the front door)
// while the actual definition lives in @walletdigital/money.
export {
  SUPPORTED_CURRENCIES,
  type Currency,
  isCurrency,
  assertCurrency,
  Money,
} from '@walletdigital/money'
