// Centralized list of Kafka topics.
// All produce/consume calls reference these constants to avoid typos
// and to allow a global rename in one place.
export const TOPICS = {
  USER: 'walletdigital.user',
  ACCOUNT: 'walletdigital.account',
  WALLET: 'walletdigital.wallet',
  TRANSACTION: 'walletdigital.transaction',
  NOTIFICATION: 'walletdigital.notification',
} as const

export type Topic = (typeof TOPICS)[keyof typeof TOPICS]
