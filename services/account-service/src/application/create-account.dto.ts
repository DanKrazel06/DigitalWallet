// DTO for the create-account use-case. Kept separate from account.dto.ts
// because the creation flow has different inputs (userId, email come from
// the user.created event, not from an HTTP request body) and emits an
// outbox event.

export interface CreateAccountFromUserInput {
  userId: string
  email: string
}

export interface CreateAccountFromUserOutput {
  accountId: string
  userId: string
  email: string
  createdAt: string
}
