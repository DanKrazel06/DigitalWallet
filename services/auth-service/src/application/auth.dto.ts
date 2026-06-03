// Application-layer DTOs (Data Transfer Objects).
//
// These types describe the inputs/outputs of the AuthService methods.
// Keeping them in a dedicated file:
//   - keeps auth.service.ts focused on behaviour
//   - lets the HTTP layer import only the contracts (without pulling in
//     the implementation and its dependencies)
//   - documents the public surface of the application layer in one place

// ---------- login ----------
export interface LoginInput {
  email: string
  password: string
}

export interface LoginOutput {
  accessToken: string
  refreshToken: string
  user: {
    id: string
    email: string
  }
}

// ---------- refresh ----------
export interface RefreshInput {
  refreshToken: string
}

export interface RefreshOutput {
  accessToken: string
  refreshToken: string
}

// ---------- logout ----------
export interface LogoutInput {
  refreshToken: string
}

// ---------- getUserById ----------
export interface GetUserByIdInput {
  userId: string
}

export interface GetUserByIdOutput {
  id: string
  email: string
  createdAt: string
}
