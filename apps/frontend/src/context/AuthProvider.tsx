import { useEffect, useState, type ReactNode } from 'react'
import { login as loginApi } from '../services/authService'
import { parseJwt, type AuthTokenPayload } from '../utils/jwt'
import { AuthContext, ACCESS_TOKEN_KEY, type AuthContextValue } from './AuthContext'
import { SESSION_INVALIDATED_EVENT } from '../utils/session'

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

  useEffect(() => {
    if (!accessToken || !user) return

    function invalidate() {
      // A late 401 from an older request must not discard a newer login.
      if (localStorage.getItem(ACCESS_TOKEN_KEY) === accessToken) {
        localStorage.removeItem(ACCESS_TOKEN_KEY)
      }
      setAuthState((current) =>
        current.accessToken === accessToken ? { accessToken: null, user: null } : current,
      )
    }

    const expiresAt = user.exp * 1000
    function onFocus() {
      if (Date.now() >= expiresAt) invalidate()
    }
    function onInvalidated(event: Event) {
      if ((event as CustomEvent<string>).detail === accessToken) invalidate()
    }

    const timeout = window.setTimeout(invalidate, Math.max(0, expiresAt - Date.now()))
    window.addEventListener('focus', onFocus)
    window.addEventListener(SESSION_INVALIDATED_EVENT, onInvalidated)
    return () => {
      window.clearTimeout(timeout)
      window.removeEventListener('focus', onFocus)
      window.removeEventListener(SESSION_INVALIDATED_EVENT, onInvalidated)
    }
  }, [accessToken, user])

  async function signIn(email: string, password: string): Promise<AuthTokenPayload> {
    const { access_token } = await loginApi(email, password)

    const payload = parseJwt(access_token)
    if (!payload || payload.exp * 1000 <= Date.now()) {
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
