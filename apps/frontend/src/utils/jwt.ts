import { ROLE_ADMIN, ROLE_SUPERVISOR, ROLE_TECNICO, type RoleCode } from '../constants/roles'

export type AuthTokenPayload = {
  sub: number
  role: number
  roleCode: RoleCode
  deleg: number
  exp: number
  iat?: number
}

function isRoleCode(value: unknown): value is RoleCode {
  return value === ROLE_TECNICO || value === ROLE_SUPERVISOR || value === ROLE_ADMIN
}

export function parseJwt(token: string): AuthTokenPayload | null {
  try {
    const [, payloadBase64] = token.split('.')
    const normalized = payloadBase64.replace(/-/g, '+').replace(/_/g, '/')
    const decoded = atob(normalized)
    const payload = JSON.parse(decoded) as Partial<AuthTokenPayload>

    if (
      typeof payload.sub !== 'number' ||
      typeof payload.role !== 'number' ||
      !isRoleCode(payload.roleCode) ||
      typeof payload.deleg !== 'number' ||
      typeof payload.exp !== 'number'
    ) {
      return null
    }

    return payload as AuthTokenPayload
  } catch (e) {
    console.error('Error al parsear JWT', e)
    return null
  }
}
