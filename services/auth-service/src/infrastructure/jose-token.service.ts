import { jwtVerify, SignJWT } from 'jose'
import type { AccessTokenPayload, TokenService } from '../domain/ports.js'

// JoseTokenService — concrete implementation of TokenService.
//
// Signs and verifies short-lived access JWTs with HMAC-SHA256 (HS256).
// HS256 is sufficient for a single service that both signs and verifies
// its own tokens. If multiple services need to verify these tokens we
// would switch to RS256/EdDSA + JWKs — out of scope here.
export interface JoseTokenServiceOptions {
  // Secret key for HS256. Must be >= 32 bytes. Validated upstream by config.ts.
  secret: string
  ttlSeconds: number
  issuer: string
  audience: string
}

export class JoseTokenService implements TokenService {
  private readonly secretBytes: Uint8Array

  constructor(private readonly options: JoseTokenServiceOptions) {
    this.secretBytes = new TextEncoder().encode(options.secret)
  }

  async signAccessToken(payload: AccessTokenPayload): Promise<string> {
    return new SignJWT({ email: payload.email })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(payload.sub)
      .setIssuer(this.options.issuer)
      .setAudience(this.options.audience)
      .setIssuedAt()
      .setExpirationTime(`${this.options.ttlSeconds}s`)
      .sign(this.secretBytes)
  }

  async verifyAccessToken(token: string): Promise<AccessTokenPayload> {
    // jwtVerify throws on any failure (expired, bad signature, wrong issuer,
    // wrong audience). The HTTP layer's auth guard catches these and
    // returns 401 — no need to translate to a domain error here.
    const { payload } = await jwtVerify(token, this.secretBytes, {
      issuer: this.options.issuer,
      audience: this.options.audience,
      algorithms: ['HS256'],
    })

    if (typeof payload.sub !== 'string' || typeof payload.email !== 'string') {
      // Should never happen given how we sign tokens, but better explicit
      // than a confusing runtime cast downstream.
      throw new Error('Access token payload is missing required claims')
    }

    return { sub: payload.sub, email: payload.email }
  }
}
