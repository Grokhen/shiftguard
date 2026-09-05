import type { AuthPayload } from '../middlewares/authRequired'
import { httpError } from './httpError'

export type AuthUser = AuthPayload

export async function getUserRoleCodigo(user: AuthUser): Promise<string | null> {
  // authRequired has already checked this role against the current account.
  return user.roleCode
}

export function isAdminCodigo(codigo: string | null) {
  return codigo === 'ADMIN'
}

export async function ensureAdmin(user: AuthUser) {
  const codigo = await getUserRoleCodigo(user)
  if (codigo !== 'ADMIN') {
    throw httpError('Acción reservada a administradores', 403)
  }
}

export async function ensureSupervisorOrAdmin(user: AuthUser) {
  const codigo = await getUserRoleCodigo(user)
  if (!codigo) {
    throw httpError('Rol de usuario no encontrado', 500)
  }
  if (!['SUPERVISOR', 'ADMIN'].includes(codigo)) {
    throw httpError('No tienes permisos para realizar esta acción', 403)
  }
}
