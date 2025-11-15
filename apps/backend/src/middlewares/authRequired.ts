import { Request, Response, NextFunction } from 'express'
import * as jwt from 'jsonwebtoken'
import { ENV } from '../config/env'

// Payload que TU aplicación espera dentro del token
export interface AuthPayload {
  sub: number
  role: number
  deleg: number
}

// Request extendido con user
export interface AuthenticatedRequest extends Request {
  user?: AuthPayload
}

// Type guard: comprueba en runtime y ayuda a TS
function isAuthPayload(payload: unknown): payload is AuthPayload {
  if (!payload || typeof payload !== 'object') return false

  const p = payload as any
  return (
    typeof p.sub === 'number' &&
    typeof p.role === 'number' &&
    typeof p.deleg === 'number'
  )
}

export function authRequired(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null

  if (!token) {
    return res.status(401).json({ error: 'Token requerido' })
  }

  try {
    const decoded = jwt.verify(token, ENV.JWT_SECRET)

    // Aquí decoded es: string | object (según tipos de jsonwebtoken)
    if (!isAuthPayload(decoded)) {
      return res.status(401).json({ error: 'Token inválido' })
    }

    // A partir de aquí, TS sabe que decoded es AuthPayload
    req.user = decoded
    next()
  } catch (err) {
    console.error('Error verificando token JWT:', err)
    return res.status(401).json({ error: 'Token inválido' })
  }
}

