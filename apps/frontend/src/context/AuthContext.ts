import { createContext } from 'react'
import type { AuthTokenPayload } from '../utils/jwt'

export type AuthContextValue = {
  accessToken: string | null
  user: AuthTokenPayload | null
  isAuthenticated: boolean
  isLoading: boolean
  signIn: (email: string, password: string) => Promise<AuthTokenPayload>
  signOut: () => void
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export const ACCESS_TOKEN_KEY = 'access_token'
