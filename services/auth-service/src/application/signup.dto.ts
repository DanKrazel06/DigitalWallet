// DTOs for the signup use-case. Kept separate from auth.dto.ts because
// signup belongs to a different orchestration (transactional + outbox).

export interface SignupInput {
  email: string
  password: string
}

export interface SignupOutput {
  userId: string
  email: string
  createdAt: string
}
