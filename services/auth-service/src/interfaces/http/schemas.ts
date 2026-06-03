import { z } from 'zod'

// HTTP-boundary validation schemas.
//
// These run BEFORE any use-case is called, so we catch malformed JSON,
// missing fields, or obvious garbage upfront. The domain layer trusts
// what it receives because the HTTP layer has already filtered it.
//
// We keep these rules permissive on purpose. Strict business validation
// (canonical email form, full RFC compliance, banned-password lists, etc.)
// is the domain's job — see Email.create() and future PasswordPolicy.
// Defence in depth: this layer rejects junk; the domain enforces meaning.

const emailField = z
  .string()
  .trim()
  .min(3, 'Email is too short')
  .max(254, 'Email is too long')
  .email('Email format looks invalid')

const passwordField = z
  .string()
  .min(8, 'Password must be at least 8 characters long')
  .max(128, 'Password must be at most 128 characters long')

// ---------- POST /signup ----------
export const signupBodySchema = z.object({
  email: emailField,
  password: passwordField,
})
export type SignupBody = z.infer<typeof signupBodySchema>

// ---------- POST /login ----------
export const loginBodySchema = z.object({
  email: emailField,
  password: passwordField,
})
export type LoginBody = z.infer<typeof loginBodySchema>

// ---------- POST /refresh ----------
export const refreshBodySchema = z.object({
  refreshToken: z.string().min(1),
})
export type RefreshBody = z.infer<typeof refreshBodySchema>

// ---------- POST /logout ----------
export const logoutBodySchema = z.object({
  refreshToken: z.string().min(1),
})
export type LogoutBody = z.infer<typeof logoutBodySchema>
