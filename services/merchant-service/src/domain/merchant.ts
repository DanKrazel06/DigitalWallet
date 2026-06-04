// Merchant entity — identity of an actor that owns a wallet.
//
// `type` is fixed at creation (an employee doesn't become a company).
// `status` is mutable (active/inactive) via the dedicated use-case.

export type MerchantType = 'employee' | 'company'
export type MerchantStatus = 'active' | 'inactive'

export interface MerchantProps {
  id: string
  name: string
  type: MerchantType
  status: MerchantStatus
  createdAt: Date
  updatedAt: Date
}

export class Merchant {
  private constructor(private readonly props: MerchantProps) {}

  // Factory for a brand-new merchant.
  static create(input: { id: string; name: string; type: MerchantType }): Merchant {
    const now = new Date()
    return new Merchant({
      id: input.id,
      name: input.name,
      type: input.type,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    })
  }

  // Rebuild from a persisted row.
  static rehydrate(props: MerchantProps): Merchant {
    return new Merchant(props)
  }

  // Returns a NEW merchant entity with the requested status. Immutability
  // keeps the domain transparent — the repository decides when to persist.
  withStatus(status: MerchantStatus): Merchant {
    return new Merchant({ ...this.props, status, updatedAt: new Date() })
  }

  get id(): string {
    return this.props.id
  }
  get name(): string {
    return this.props.name
  }
  get type(): MerchantType {
    return this.props.type
  }
  get status(): MerchantStatus {
    return this.props.status
  }
  get createdAt(): Date {
    return this.props.createdAt
  }
  get updatedAt(): Date {
    return this.props.updatedAt
  }

  isActive(): boolean {
    return this.props.status === 'active'
  }

  toSnapshot(): MerchantProps {
    return { ...this.props }
  }
}
