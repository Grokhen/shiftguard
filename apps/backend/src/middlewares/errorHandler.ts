import { Request, Response, NextFunction } from 'express'
import { ZodError } from 'zod'
import { Prisma } from '@prisma/client'

export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  console.error(err)

  if (err instanceof ZodError) {
    return res.status(400).json({
      error: 'Datos de entrada inválidos',
      issues: err.issues,
    })
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'El registro ya existe' })
    if (err.code === 'P2003')
      return res.status(400).json({ error: 'La referencia indicada no es válida' })
    if (err.code === 'P2025') return res.status(404).json({ error: 'Registro no encontrado' })
  }

  const candidate = err.statusCode || err.status
  const status =
    Number.isInteger(candidate) && candidate >= 400 && candidate < 600 ? candidate : 500
  res.status(status).json({ error: status >= 500 ? 'Error interno del servidor' : err.message })
}
