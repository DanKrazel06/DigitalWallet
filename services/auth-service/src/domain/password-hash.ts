// PasswordHash value object — wraps an already-hashed password string.
//
// The domain layer NEVER sees a plaintext password. Hashing (Argon2id) is
// an infrastructure concern; this VO just guarantees that whatever we
// store / pass around is a non-empty hash, not raw text.
//
// Using a dedicated type prevents accidentally passing a plaintext password
// where a hash is expected (and vice-versa) — both are `string` otherwise.
export class PasswordHash {
  private constructor(readonly value: string) {}

  // Wrap a hash produced by the password hasher (infrastructure adapter).
  static fromHashed(hashed: string): PasswordHash {
    if (hashed.length === 0) {
      throw new Error('PasswordHash cannot be empty')
    }
    return new PasswordHash(hashed)
  }

  toString(): string {
    return this.value
  }
}
