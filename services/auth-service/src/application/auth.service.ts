import { Email } from '../domain/email.js'
import { InvalidCredentialsError, InvalidRefreshTokenError, UserNotFoundError } from '../domain/errors.js'
import type {
  PasswordHasher,
  RefreshTokenStore,
  TokenService,
  UserRepository,
} from '../domain/ports.js'
import type {
  GetUserByIdInput,
  GetUserByIdOutput,
  LoginInput,
  LoginOutput,
  LogoutInput,
  RefreshInput,
  RefreshOutput,
} from './auth.dto.js'

// AuthService — groups together the post-signup operations that share the
// same set of dependencies: login, refresh, logout, getUserById.
//
// Signup is intentionally kept separate (SignupUseCase) because it owns a
// transactional concern (user + outbox written atomically via UnitOfWork)
// and a different set of collaborators.

// A dummy Argon2id hash used to keep verification time constant when the
// user does not exist. The verification will fail anyway, but only after
// spending the same CPU time as a real verification. Defence against user
// enumeration via timing.
const DUMMY_HASH =
  '$argon2id$v=19$m=65536,t=3,p=4$YWFhYWFhYWFhYWFhYWFhYQ$XYZQfM1q4t1V3VqXqQOQfO4uLZ8XYY4WjGsK1Y8wK7g'

export class AuthService {
  constructor(
    private readonly users: UserRepository,
    private readonly hasher: PasswordHasher,
    private readonly tokens: TokenService,
    private readonly refreshStore: RefreshTokenStore,
  ) {}

  // -------------------------------------------------------------------------
  // login — authenticate by email + password, return an access/refresh pair.
  //
  // Security:
  //   - Same generic error on "user not found" and "wrong password"
  //     (no user enumeration).
  //   - Hash verification always runs, even against a dummy hash, to keep
  //     response time independent of whether the user exists.
  // -------------------------------------------------------------------------
  async login(input: LoginInput): Promise<LoginOutput> {
    let email: Email
    try {
      email = Email.create(input.email)
    } catch {
      throw new InvalidCredentialsError()
    }

    const user = await this.users.findByEmail(email)
    const hashToVerify = user?.passwordHash.value ?? DUMMY_HASH
    const ok = await this.hasher.verify(input.password, hashToVerify)

    if (user === null || !ok) {
      throw new InvalidCredentialsError()
    }

    const [accessToken, refreshToken] = await Promise.all([
      this.tokens.signAccessToken({ sub: user.id, email: user.email.value }),
      this.refreshStore.issue(user.id),
    ])

    return { accessToken, refreshToken, user: { id: user.id, email: user.email.value } }
  }

  // -------------------------------------------------------------------------
  // refresh — exchange a valid refresh token for a fresh pair.
  //
  // Rotation policy: every refresh INVALIDATES the old token and issues a
  // new one. Contains the blast radius of a leaked refresh token.
  // -------------------------------------------------------------------------
  async refresh(input: RefreshInput): Promise<RefreshOutput> {
    const rotated = await this.refreshStore.rotate(input.refreshToken)
    if (rotated === null) {
      throw new InvalidRefreshTokenError()
    }

    const user = await this.users.findById(rotated.userId)
    if (user === null) {
      // The user was deleted while a refresh token was still active.
      // Revoke the newly-issued token and surface the generic error.
      await this.refreshStore.revoke(rotated.newToken)
      throw new InvalidRefreshTokenError()
    }

    const accessToken = await this.tokens.signAccessToken({
      sub: user.id,
      email: user.email.value,
    })

    return { accessToken, refreshToken: rotated.newToken }
  }

  // -------------------------------------------------------------------------
  // logout — revoke a refresh token. Idempotent (no error if already gone).
  // The short-lived access token remains valid until it expires (~15 min).
  // -------------------------------------------------------------------------
  async logout(input: LogoutInput): Promise<void> {
    await this.refreshStore.revoke(input.refreshToken)
  }

  // -------------------------------------------------------------------------
  // getUserById — pure lookup. The HTTP layer is responsible for deciding
  // where the userId comes from (JWT sub for /me, URL param for /users/:id).
  // -------------------------------------------------------------------------
  async getUserById(input: GetUserByIdInput): Promise<GetUserByIdOutput> {
    const user = await this.users.findById(input.userId)
    if (user === null) {
      throw new UserNotFoundError()
    }
    return {
      id: user.id,
      email: user.email.value,
      createdAt: user.createdAt.toISOString(),
    }
  }
}
