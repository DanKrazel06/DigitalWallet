import argon2 from 'argon2'
import type { PasswordHasher } from '../domain/ports.js'

// Argon2PasswordHasher — concrete implementation of PasswordHasher.
//
// Uses Argon2id, winner of the 2015 Password Hashing Competition and the
// OWASP 2026 recommendation. Resistant to GPU/ASIC attacks thanks to its
// memory-hard property.
//
// Parameters tuned per OWASP guidance:
//   - memoryCost   65536 KiB (64 MiB) — main defence against parallel cracking
//   - timeCost     3 iterations       — CPU work factor
//   - parallelism  4 lanes            — fits modern CPUs without starving the request loop
// Total hashing time on a developer laptop: ~30-80 ms, which is the sweet
// spot (cheap enough for login, expensive enough to discourage brute-force).
const HASH_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 65_536,
  timeCost: 3,
  parallelism: 4,
} as const

export class Argon2PasswordHasher implements PasswordHasher {
  async hash(plaintext: string): Promise<string> {
    return argon2.hash(plaintext, HASH_OPTIONS)
  }

  async verify(plaintext: string, hashed: string): Promise<boolean> {
    try {
      return await argon2.verify(hashed, plaintext)
    } catch {
      // `verify` throws on malformed hashes (e.g. the dummy hash used to
      // mitigate timing attacks against unknown users). Treat any error
      // as "no match" so callers always get a boolean.
      return false
    }
  }
}
