import { Request, Response, NextFunction } from 'express'
import { ZodError } from 'zod'

export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  console.error(err)

  if (err instanceof ZodError) {
    return res.status(400).json({
      error: 'Datos de entrada inválidos',
      issues: err.issues,
    })
  }

  const status = err.statusCode || err.status || 500
  res.status(status).json({ error: err.message || 'Internal Server Error' })
}
