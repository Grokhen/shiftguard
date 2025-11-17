import { Request, Response, NextFunction } from 'express'
import * as jwt from 'jsonwebtoken'
import { ENV } from '../config/env'

export interface AuthPayload {
  sub: number
  role: number
  deleg: number
}

function isAuthPayload(payload: unknown): payload is AuthPayload {
  if (!payload || typeof payload !== 'object') return false

  const p = payload as any
  return typeof p.sub === 'number' && typeof p.role === 'number' && typeof p.deleg === 'number'
}

export function authRequired(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null

  if (!token) {
    return res.status(401).json({ error: 'Token requerido' })
  }

  try {
    const decoded = jwt.verify(token, ENV.JWT_SECRET)

    if (!isAuthPayload(decoded)) {
      return res.status(401).json({ error: 'Token inválido' })
    }

    req.user = decoded
    next()
  } catch (err) {
    console.error('Error verificando token JWT:', err)
    return res.status(401).json({ error: 'Token inválido' })
  }
}
