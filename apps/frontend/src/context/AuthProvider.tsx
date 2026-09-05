import { useEffect, useState, type ReactNode } from 'react'
import { login as loginApi } from '../services/authService'
import { parseJwt, type AuthTokenPayload } from '../utils/jwt'
import { AuthContext, ACCESS_TOKEN_KEY, type AuthContextValue } from './AuthContext'
import {
  PASSWORD_CHANGED_EVENT,
  PASSWORD_CHANGE_REQUIRED_EVENT,
  SESSION_INVALIDATED_EVENT,
} from '../utils/session'

function getInitialAuthState(): {
  accessToken: string | null
  user: AuthTokenPayload | null
  passwordChanged: boolean
} {
  if (typeof window === 'undefined') {
    return { accessToken: null, user: null, passwordChanged: false }
  }

  const storedToken = localStorage.getItem(ACCESS_TOKEN_KEY)
  if (!storedToken) {
    return { accessToken: null, user: null, passwordChanged: false }
  }

  const payload = parseJwt(storedToken)

  if (!payload || payload.exp * 1000 <= Date.now()) {
    localStorage.removeItem(ACCESS_TOKEN_KEY)
    return { accessToken: null, user: null, passwordChanged: false }
  }

  return { accessToken: storedToken, user: payload, passwordChanged: false }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [{ accessToken, user, passwordChanged }, setAuthState] = useState(getInitialAuthState)

  useEffect(() => {
    if (!accessToken || !user) return

    function invalidate(changed = false) {
      // A late 401 from an older request must not discard a newer login.
      if (localStorage.getItem(ACCESS_TOKEN_KEY) === accessToken) {
        localStorage.removeItem(ACCESS_TOKEN_KEY)
      }
      setAuthState((current) =>
        current.accessToken === accessToken
          ? { accessToken: null, user: null, passwordChanged: changed }
          : current,
      )
    }

    const expiresAt = user.exp * 1000
    function onFocus() {
      if (Date.now() >= expiresAt) invalidate()
    }
    function onInvalidated(event: Event) {
      if ((event as CustomEvent<string>).detail === accessToken) invalidate()
    }
    function onPasswordChangeRequired(event: Event) {
      if ((event as CustomEvent<string>).detail !== accessToken) return
      setAuthState((current) =>
        current.accessToken === accessToken && current.user && !current.user.requiresPasswordChange
          ? { ...current, user: { ...current.user, requiresPasswordChange: true } }
          : current,
      )
    }
    function onPasswordChanged(event: Event) {
      if ((event as CustomEvent<string>).detail === accessToken) invalidate(true)
    }

    const timeout = window.setTimeout(invalidate, Math.max(0, expiresAt - Date.now()))
    window.addEventListener('focus', onFocus)
    window.addEventListener(SESSION_INVALIDATED_EVENT, onInvalidated)
    window.addEventListener(PASSWORD_CHANGE_REQUIRED_EVENT, onPasswordChangeRequired)
    window.addEventListener(PASSWORD_CHANGED_EVENT, onPasswordChanged)
    return () => {
      window.clearTimeout(timeout)
      window.removeEventListener('focus', onFocus)
      window.removeEventListener(SESSION_INVALIDATED_EVENT, onInvalidated)
      window.removeEventListener(PASSWORD_CHANGE_REQUIRED_EVENT, onPasswordChangeRequired)
      window.removeEventListener(PASSWORD_CHANGED_EVENT, onPasswordChanged)
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
      passwordChanged: false,
    })

    return payload
  }

  function signOut() {
    localStorage.removeItem(ACCESS_TOKEN_KEY)
    setAuthState({
      accessToken: null,
      user: null,
      passwordChanged: false,
    })
  }

  const value: AuthContextValue = {
    accessToken,
    user,
    isAuthenticated: !!accessToken && !!user,
    isLoading: false,
    passwordChanged,
    signIn,
    signOut,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
