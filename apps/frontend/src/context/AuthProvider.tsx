import { useState, type ReactNode } from 'react'
import { login as loginApi } from '../services/authService'
import { parseJwt, type AuthTokenPayload } from '../utils/jwt'
import { AuthContext, ACCESS_TOKEN_KEY, type AuthContextValue } from './AuthContext'

function getInitialAuthState(): {
  accessToken: string | null
  user: AuthTokenPayload | null
} {
  if (typeof window === 'undefined') {
    return { accessToken: null, user: null }
  }

  const storedToken = localStorage.getItem(ACCESS_TOKEN_KEY)
  if (!storedToken) {
    return { accessToken: null, user: null }
  }

  const payload = parseJwt(storedToken)

  if (!payload || payload.exp * 1000 <= Date.now()) {
    localStorage.removeItem(ACCESS_TOKEN_KEY)
    return { accessToken: null, user: null }
  }

  return { accessToken: storedToken, user: payload }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [{ accessToken, user }, setAuthState] = useState(getInitialAuthState)

  async function signIn(email: string, password: string): Promise<AuthTokenPayload> {
    const { access_token } = await loginApi(email, password)

    const payload = parseJwt(access_token)
    if (!payload) {
      throw new Error('Token recibido inválido')
    }

    localStorage.setItem(ACCESS_TOKEN_KEY, access_token)

    setAuthState({
      accessToken: access_token,
      user: payload,
    })

    return payload
  }

  function signOut() {
    localStorage.removeItem(ACCESS_TOKEN_KEY)
    setAuthState({
      accessToken: null,
      user: null,
    })
  }

  const value: AuthContextValue = {
    accessToken,
    user,
    isAuthenticated: !!accessToken && !!user,
    isLoading: false,
    signIn,
    signOut,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
