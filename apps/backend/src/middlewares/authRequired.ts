import { Request, Response, NextFunction } from 'express'
import * as jwt from 'jsonwebtoken'
import { ENV } from '../config/env'
import { prisma } from '../prisma'

export interface AuthPayload {
  sub: number
  role: number
  roleCode: string
  deleg: number
}

type SessionPayload = AuthPayload & { passwordVersion: number; exp: number }

function isAuthPayload(payload: unknown): payload is SessionPayload {
  if (!payload || typeof payload !== 'object') return false

  const p = payload as Record<string, unknown>
  return (
    Number.isSafeInteger(p.sub) &&
    Number(p.sub) > 0 &&
    Number.isSafeInteger(p.role) &&
    Number(p.role) > 0 &&
    typeof p.roleCode === 'string' &&
    Number.isSafeInteger(p.deleg) &&
    Number(p.deleg) > 0 &&
    Number.isSafeInteger(p.passwordVersion) &&
    Number(p.passwordVersion) >= 0 &&
    Number.isSafeInteger(p.exp)
  )
}

export async function authRequired(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null

  if (!token) {
    return res.status(401).json({ error: 'Token requerido' })
  }

  let decoded: unknown
  try {
    decoded = jwt.verify(token, ENV.JWT_SECRET, { algorithms: ['HS256'] })
  } catch {
    return res.status(401).json({ error: 'Token inválido' })
  }

  if (!isAuthPayload(decoded)) {
    return res.status(401).json({ error: 'Token inválido' })
  }

  try {
    const user = await prisma.usuario.findFirst({
      where: { id: decoded.sub, activo: true, bloqueado_en: null },
      select: {
        id: true,
        rol_id: true,
        delegacion_id: true,
        password_actualizada_en: true,
        Rol: { select: { codigo: true } },
      },
    })

    if (
      !user ||
      user.rol_id !== decoded.role ||
      user.Rol.codigo !== decoded.roleCode ||
      user.delegacion_id !== decoded.deleg ||
      (user.password_actualizada_en?.getTime() ?? 0) !== decoded.passwordVersion
    ) {
      return res.status(401).json({ error: 'Sesión invalidada. Inicia sesión de nuevo.' })
    }

    req.user = {
      sub: user.id,
      role: user.rol_id,
      roleCode: user.Rol.codigo,
      deleg: user.delegacion_id,
    }
    next()
  } catch (error) {
    next(error)
  }
}
