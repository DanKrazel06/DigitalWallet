import type { Currency } from './currency.js'

// Money value object — bigint amount in MINOR UNITS (cents) with currency.
//
// Immutable. Arithmetic returns NEW Money instances. Never goes through
// floating-point (would lose precision). Mixed-currency operations throw
// loudly rather than silently doing the wrong thing.
//
// Centralised here so every microservice that touches money uses the
// exact same arithmetic and serialisation rules.
export class Money {
  private constructor(
    readonly amount: bigint,
    readonly currency: Currency,
  ) {}

  // ---- factories ----

  // Construct from a raw minor-unit amount (cents). Use for Prisma row
  // → domain mapping.
  static fromMinor(amount: bigint, currency: Currency): Money {
    return new Money(amount, currency)
  }

  // Zero balance in a given currency.
  static zero(currency: Currency): Money {
    return new Money(0n, currency)
  }

  // Parse a decimal string ("12.34") into Money without ever using float.
  // Splits on the dot, validates each side is digits, multiplies by 100.
  static fromDecimal(decimal: string, currency: Currency): Money {
    const trimmed = decimal.trim()
    if (!/^-?\d+(?:\.\d{1,2})?$/.test(trimmed)) {
      throw new Error(`Invalid decimal amount: "${decimal}"`)
    }
    const negative = trimmed.startsWith('-')
    const body = negative ? trimmed.slice(1) : trimmed
    const [whole, fraction = ''] = body.split('.')
    const padded = (fraction + '00').slice(0, 2)
    const amount = BigInt(whole + padded)
    return new Money(negative ? -amount : amount, currency)
  }

  // Like `fromDecimal` but tolerates extra trailing zeros (e.g. "100.0000"
  // as returned by Prisma's Decimal(20, 4) columns). Any precision beyond
  // 2 decimal places is dropped silently — we never store fractional
  // cents in this milestone. Mono-currency USD assumption baked in here;
  // multi-currency would parametrise the scale.
  static fromDecimalString(decimal: string, currency: Currency): Money {
    const trimmed = decimal.trim()
    if (!/^-?\d+(?:\.\d+)?$/.test(trimmed)) {
      throw new Error(`Invalid decimal amount: "${decimal}"`)
    }
    const negative = trimmed.startsWith('-')
    const body = negative ? trimmed.slice(1) : trimmed
    const [whole, fraction = ''] = body.split('.')
    // Pad to at least 2 chars, then truncate to exactly 2 (drop extra
    // precision like "0050" -> "00").
    const padded = (fraction + '00').slice(0, 2)
    const amount = BigInt(whole + padded)
    return new Money(negative ? -amount : amount, currency)
  }

  // ---- predicates ----

  isZero(): boolean {
    return this.amount === 0n
  }

  isPositive(): boolean {
    return this.amount > 0n
  }

  isNegative(): boolean {
    return this.amount < 0n
  }

  equals(other: Money): boolean {
    return this.currency === other.currency && this.amount === other.amount
  }

  greaterThanOrEqual(other: Money): boolean {
    this.assertSameCurrency(other)
    return this.amount >= other.amount
  }

  // ---- arithmetic (always returns NEW instances) ----

  add(other: Money): Money {
    this.assertSameCurrency(other)
    return new Money(this.amount + other.amount, this.currency)
  }

  subtract(other: Money): Money {
    this.assertSameCurrency(other)
    return new Money(this.amount - other.amount, this.currency)
  }

  negate(): Money {
    return new Money(-this.amount, this.currency)
  }

  // ---- serialisation ----

  // Serialise to wire format: a string of digits (signed). bigint cannot
  // be JSON-stringified natively, so we always go through a string.
  toMinorString(): string {
    return this.amount.toString()
  }

  // Serialise to a decimal string ("100.00", "-1.25") suitable for
  // Prisma's Decimal(20, 4) columns and human-readable JSON. Padding
  // ensures we always get exactly 2 decimal places (USD assumption).
  toDecimalString(): string {
    const negative = this.amount < 0n
    const absolute = negative ? -this.amount : this.amount
    const whole = absolute / 100n
    const fraction = absolute % 100n
    return `${negative ? '-' : ''}${whole.toString()}.${fraction.toString().padStart(2, '0')}`
  }

  toString(): string {
    return `${this.amount.toString()} ${this.currency} (minor units)`
  }

  // ---- internals ----

  private assertSameCurrency(other: Money): void {
    if (this.currency !== other.currency) {
      throw new Error(`Currency mismatch: ${this.currency} vs ${other.currency}`)
    }
  }
}
