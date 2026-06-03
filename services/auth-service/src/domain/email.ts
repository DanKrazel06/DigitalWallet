import { InvalidEmailError } from './errors.js'

// Email value object. Immutable, self-validating, case-insensitive.
//
// Once an `Email` instance exists, the rest of the codebase can trust it
// blindly — there is no way to construct one with an invalid value.
// This is the "make illegal states unrepresentable" principle.
export class Email {
  // Conservative RFC-5322-ish pattern. Good enough for signup: we do NOT
  // try to match every edge case of the RFC; production systems typically
  // also validate at SMTP send-time. Simple, rejects the obvious garbage.
  private static readonly PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

  private constructor(readonly value: string) {}

  // Factory: the ONLY way to obtain an Email instance.
  // Trims and lowercases before validation so equality is reliable
  // across signup/login flows ("  Foo@BAR.com " === "foo@bar.com").
  static create(raw: string): Email {
    const normalized = raw.trim().toLowerCase()
    if (!Email.PATTERN.test(normalized)) {
      throw new InvalidEmailError(raw)
    }
    return new Email(normalized)
  }

  // Equality by value — two Email objects with the same string are equal.
  equals(other: Email): boolean {
    return this.value === other.value
  }

  toString(): string {
    return this.value
  }
}
