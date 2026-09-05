import type { Prisma } from '@prisma/client'
import { z } from 'zod'

// Permissions are PostgreSQL DATE values: a calendar day, not an instant in a timezone.
export const calendarDateSchema = z.iso
  .date('Usa una fecha válida con formato YYYY-MM-DD')
  .refine((value) => !value.startsWith('0000-'), 'El año debe ser mayor que cero')

export const calendarYearSchema = z.coerce.number().int().min(1).max(9999)

export function permissionYearFilter(year: number): Prisma.PermisoWhereInput {
  const formatted = String(year).padStart(4, '0')
  // Inclusive overlap also includes permissions that began before January 1.
  return {
    fecha_inicio: { lte: new Date(`${formatted}-12-31T00:00:00.000Z`) },
    fecha_fin: { gte: new Date(`${formatted}-01-01T00:00:00.000Z`) },
  }
}
