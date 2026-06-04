export type MerchantStatus = 'active' | 'inactive'

export interface MerchantProjectionProps {
  id: string
  status: MerchantStatus
  updatedAt: Date
}

// MerchantProjection — minimal local view of a merchant. Only the id and
// the status are needed to decline operations initiated by an inactive
// merchant. Fed by `merchant.created` and `merchant.status_changed`.
export class MerchantProjection {
  private constructor(private readonly props: MerchantProjectionProps) {}

  static fromCreatedEvent(input: { id: string }): MerchantProjection {
    return new MerchantProjection({
      id: input.id,
      status: 'active',
      updatedAt: new Date(),
    })
  }

  static rehydrate(props: MerchantProjectionProps): MerchantProjection {
    return new MerchantProjection(props)
  }

  withStatus(status: MerchantStatus): MerchantProjection {
    return new MerchantProjection({
      ...this.props,
      status,
      updatedAt: new Date(),
    })
  }

  get id(): string {
    return this.props.id
  }
  get status(): MerchantStatus {
    return this.props.status
  }
  get updatedAt(): Date {
    return this.props.updatedAt
  }

  isActive(): boolean {
    return this.props.status === 'active'
  }

  toSnapshot(): MerchantProjectionProps {
    return { ...this.props }
  }
}
