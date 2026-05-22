import { prisma } from '../prisma'

export type AuthUser = {
  sub: number
  role: number
  deleg: number
}

function httpError(message: string, statusCode: number) {
  const err = new Error(message)
  ;(err as any).statusCode = statusCode
  return err
}

export async function getUserRoleCodigo(user: AuthUser): Promise<string | null> {
  const rol = await prisma.rolUsuario.findUnique({
    where: { id: user.role },
  })
  return rol?.codigo ?? null
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
