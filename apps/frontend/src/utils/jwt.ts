export type AuthTokenPayload = {
  sub: number
  role: number
  deleg: number
  exp: number
  iat?: number
}

export function parseJwt(token: string): AuthTokenPayload | null {
  try {
    const [, payloadBase64] = token.split('.')
    const normalized = payloadBase64.replace(/-/g, '+').replace(/_/g, '/')
    const decoded = atob(normalized)
    return JSON.parse(decoded) as AuthTokenPayload
  } catch (e) {
    console.error('Error al parsear JWT', e)
    return null
  }
}
