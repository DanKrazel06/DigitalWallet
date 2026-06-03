// Account entity — profile data owned by account-service.
// Holds the link to the auth-service user (`userId`), the email mirrored
// at creation time (denormalised for convenience), KYC status, and any
// profile fields filled in later by the user.

export type KycStatus = 'pending' | 'verified' | 'rejected'

export interface AccountProps {
  id: string
  userId: string
  email: string
  firstName: string | null
  lastName: string | null
  kycStatus: KycStatus
  createdAt: Date
  updatedAt: Date
}

export class Account {
  private constructor(private readonly props: AccountProps) {}

  // Factory used when reacting to a `user.created` event. The account is
  // initialised with a `pending` KYC status; the user will later fill in
  // their profile via PUT /accounts/me (out of scope for this milestone).
  static createFromUser(input: { id: string; userId: string; email: string }): Account {
    const now = new Date()
    return new Account({
      id: input.id,
      userId: input.userId,
      email: input.email,
      firstName: null,
      lastName: null,
      kycStatus: 'pending',
      createdAt: now,
      updatedAt: now,
    })
  }

  // Rebuild from a persisted row (used by the repository).
  static rehydrate(props: AccountProps): Account {
    return new Account(props)
  }

  get id(): string {
    return this.props.id
  }
  get userId(): string {
    return this.props.userId
  }
  get email(): string {
    return this.props.email
  }
  get firstName(): string | null {
    return this.props.firstName
  }
  get lastName(): string | null {
    return this.props.lastName
  }
  get kycStatus(): KycStatus {
    return this.props.kycStatus
  }
  get createdAt(): Date {
    return this.props.createdAt
  }
  get updatedAt(): Date {
    return this.props.updatedAt
  }

  toSnapshot(): AccountProps {
    return { ...this.props }
  }
}
