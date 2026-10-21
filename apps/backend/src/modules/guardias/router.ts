import { Router } from 'express'
import type { Prisma } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '../../prisma'
import { authRequired } from '../../middlewares/authRequired'
import { serializableTransaction } from '../../utils/transaction'
import { httpError } from '../../utils/httpError'
import { calendarWeeks, isPlanningYear, recurringCalendarWeeks, SHIFT_TIME_ZONE } from '../../utils/shiftCalendar'
import {
  ensureSupervisorOrAdmin,
  getUserRoleCodigo,
  isAdminCodigo,
  type AuthUser,
} from '../../utils/authz'

const router = Router()

router.use(authRequired)

const fechaHoraGuardiaSchema = z.iso
  .datetime({
    offset: true,
    error: 'Usa una fecha y hora ISO válida con zona horaria (Z o ±HH:MM)',
  })
  .refine((value) => !/\.\d{4}/.test(value), 'Usa como máximo tres decimales de segundo')
  .refine((value) => {
    const year = new Date(value).getUTCFullYear()
    return !value.startsWith('0000-') && year >= 1 && year <= 9999
  }, 'El año debe estar entre 1 y 9999, también al convertirlo a UTC')

const asignacionGuardiaInputSchema = z.object({
  usuario_id: z.number().int().positive(),
  rol_guardia_id: z.number().int().positive(),
})

const crearGuardiaSchema = z
  .object({
    fecha_inicio: fechaHoraGuardiaSchema,
    fecha_fin: fechaHoraGuardiaSchema,
    estado: z.string().max(20).optional(),
    asignaciones: z.array(asignacionGuardiaInputSchema).optional(),
  })
  .refine((d) => new Date(d.fecha_fin) > new Date(d.fecha_inicio), {
    path: ['fecha_fin'],
    message: 'fecha_fin > fecha_inicio',
  })

const listarGuardiasQuerySchema = z
  .object({
    desde: fechaHoraGuardiaSchema.optional(),
    hasta: fechaHoraGuardiaSchema.optional(),
  })
  .refine(
    (query) => !query.desde || !query.hasta || new Date(query.hasta) > new Date(query.desde),
    {
      path: ['hasta'],
      message: 'hasta debe ser posterior a desde',
    },
  )

function guardiasEnRango(
  query: z.infer<typeof listarGuardiasQuerySchema>,
): Prisma.GuardiaWhereInput {
  // Both shifts and query ranges include the start and exclude the end: [start, end).
  const where: Prisma.GuardiaWhereInput = {}
  if (query.desde) where.fecha_fin = { gt: new Date(query.desde) }
  if (query.hasta) where.fecha_inicio = { lt: new Date(query.hasta) }
  return where
}

const asignacionGuardiaSchema = asignacionGuardiaInputSchema

const actualizarGuardiaSchema = z
  .object({
    fecha_inicio: fechaHoraGuardiaSchema.optional(),
    fecha_fin: fechaHoraGuardiaSchema.optional(),
    estado: z.string().max(20).optional(),
    asignaciones: z.array(asignacionGuardiaInputSchema).optional(),
  })
  .refine(
    (d) => {
      if (d.fecha_inicio && d.fecha_fin) {
        return new Date(d.fecha_fin) > new Date(d.fecha_inicio)
      }
      return true
    },
    {
      path: ['fecha_fin'],
      message: 'fecha_fin > fecha_inicio',
    },
  )

const usuarioSeguroSelect = {
  id: true,
  nombre: true,
  apellidos: true,
  email: true,
  delegacion_id: true,
  activo: true,
} as const

// Restrict generation to operational years with complete adjacent weeks.
const calendarSchema = z.object({ anio: z.coerce.number().int().min(2000).max(2100) }).strict()

const planningSchema = z.object({
  anio: z.number().int().min(2000).max(2100),
  guardia_id: z.number().int().positive(),
  principal_id: z.number().int().positive(),
  secundario_id: z.number().int().positive().optional(),
  frecuencia_semanas: z.number().int().positive().optional(),
  reemplazar_existentes: z.boolean().default(false),
}).strict().refine(d => d.principal_id !== d.secundario_id, {
  path: ['secundario_id'], message: 'El principal y el secundario deben ser técnicos distintos.',
})

router.post('/calendario/planificar', async (req, res, next) => {
  try {
    const user = req.user as AuthUser
    await ensureSupervisorOrAdmin(user)
    const dto = planningSchema.parse(req.body)
    if (!isPlanningYear(dto.anio)) throw httpError('Solo puedes planificar el año actual o el siguiente. Actualiza el calendario.', 400)
    const weeks = calendarWeeks(dto.anio)
    if (dto.frecuencia_semanas !== undefined && dto.frecuencia_semanas > weeks.length) {
      throw httpError(`La frecuencia debe estar entre 1 y ${weeks.length} semanas.`, 400)
    }
    const result = await serializableTransaction(async tx => {
      // Repeat every read and validation on a serialization retry.
      if (!isPlanningYear(dto.anio)) throw httpError('El año ha cambiado. Actualiza el calendario.', 409)
      const first = await tx.guardia.findUnique({ where: { id: dto.guardia_id } })
      if (!first) throw httpError('Guardia no encontrada', 404)
      if (first.delegacion_id !== user.deleg) throw httpError('No puedes planificar guardias de otra delegación', 403)
      const targets = recurringCalendarWeeks(dto.anio, first.fecha_inicio, dto.frecuencia_semanas)
      if (!targets.length || targets[0].fecha_fin.getTime() !== first.fecha_fin.getTime()) {
        throw httpError('Selecciona el inicio de una semana natural del año elegido.', 400)
      }
      const users = [dto.principal_id, ...(dto.secundario_id ? [dto.secundario_id] : [])]
      const technicians = await tx.usuario.findMany({
        where: { id: { in: users }, delegacion_id: user.deleg, activo: true, Rol: { codigo: 'TECNICO' } },
        select: { id: true },
      })
      if (technicians.length !== users.length) throw httpError('Solo puedes asignar técnicos activos de tu delegación.', 400)
      const roles = await tx.rolGuardia.findMany({ where: { codigo: { in: ['PRINCIPAL', 'SECUNDARIO'] } } })
      const primaryRole = roles.find(r => r.codigo === 'PRINCIPAL')
      const secondaryRole = roles.find(r => r.codigo === 'SECUNDARIO')
      if (!primaryRole || (dto.secundario_id && !secondaryRole)) throw httpError('Faltan los roles de guardia. Revisa el catálogo.', 500)
      const assignments = [{ usuario_id: dto.principal_id, rol_guardia_id: primaryRole.id },
        ...(dto.secundario_id ? [{ usuario_id: dto.secundario_id, rol_guardia_id: secondaryRole!.id }] : [])]
      const stored = await tx.guardia.findMany({
        where: { delegacion_id: user.deleg, fecha_inicio: { in: targets.map(w => w.fecha_inicio) } },
        include: { Asignaciones: true },
      })
      const selected = targets.map(week => stored.filter(s => s.fecha_inicio.getTime() === week.fecha_inicio.getTime() && s.fecha_fin.getTime() === week.fecha_fin.getTime()))
      if (selected.some(matches => matches.length !== 1)) {
        throw httpError('Hay semanas sin preparar o con guardias anteriores de otras fechas. Revísalas en el calendario mensual antes de planificar la serie.', 409)
      }
      const changes = selected.map(matches => matches[0]).filter(shift =>
        shift.Asignaciones.length !== assignments.length || assignments.some(a =>
          !shift.Asignaciones.some(current => current.usuario_id === a.usuario_id && current.rol_guardia_id === a.rol_guardia_id)))
      const conflicts = changes.filter(s => s.Asignaciones.length > 0).map(s => s.id)
      if (conflicts.length && !dto.reemplazar_existentes) return { conflictos: conflicts, programadas: 0, actualizadas: 0 }
      if (changes.length) {
        await tx.asignacionGuardia.deleteMany({ where: { guardia_id: { in: changes.map(s => s.id) } } })
        await tx.asignacionGuardia.createMany({ data: changes.flatMap(s => assignments.map(a => ({ ...a, guardia_id: s.id }))) })
      }
      return { conflictos: [], programadas: targets.length, actualizadas: changes.length }
    })
    if (result.conflictos.length) return res.status(409).json({
      code: 'CALENDAR_ASSIGNMENTS_EXIST', error: 'Algunas semanas ya tienen otros técnicos. Revisa el calendario y confirma si quieres reemplazarlos.', guardias_conflicto: result.conflictos,
    })
    res.json({ anio: dto.anio, programadas: result.programadas, actualizadas: result.actualizadas })
  } catch (error) { next(error) }
})

router.post('/calendario', async (req, res, next) => {
  try {
    const user = req.user as AuthUser
    await ensureSupervisorOrAdmin(user)
    const { anio } = calendarSchema.parse(req.body)
    const weeks = calendarWeeks(anio)
    const result = await serializableTransaction(async tx => {
      const existing = await tx.guardia.findMany({
        where: { delegacion_id: user.deleg, fecha_inicio: { lt: weeks.at(-1)!.fecha_fin }, fecha_fin: { gt: weeks[0].fecha_inicio } },
      })
      const missing = weeks.filter(week => !existing.some(shift =>
        shift.fecha_inicio < week.fecha_fin && shift.fecha_fin > week.fecha_inicio))
      if (missing.length) await tx.guardia.createMany({
        data: missing.map(week => ({ ...week, delegacion_id: user.deleg, estado: 'PLANIFICADA', creado_por: user.sub })),
      })
      const previas = existing.filter(shift => !weeks.some(week =>
        week.fecha_inicio.getTime() === shift.fecha_inicio.getTime() && week.fecha_fin.getTime() === shift.fecha_fin.getTime())).length
      return { creadas: missing.length, guardias_previas: previas }
    })
    res.json({ ...result, anio, zona_horaria: SHIFT_TIME_ZONE })
  } catch (error) { next(error) }
})

router.get('/calendario', async (req, res, next) => {
  try {
    const user = req.user as AuthUser
    const { anio } = calendarSchema.parse(req.query)
    const weeks = calendarWeeks(anio)
    const guardias = await prisma.guardia.findMany({
      where: { delegacion_id: user.deleg, fecha_inicio: { lt: weeks.at(-1)!.fecha_fin }, fecha_fin: { gt: weeks[0].fecha_inicio } },
      include: {
        Asignaciones: {
          where: { Usuario: { delegacion_id: user.deleg } },
          include: { Usuario: { select: usuarioSeguroSelect }, RolGuardia: true },
        },
      },
      orderBy: { fecha_inicio: 'asc' },
    })
    res.json(guardias)
  } catch (error) { next(error) }
})

router.get('/tecnicos', async (req, res, next) => {
  try {
    const user = req.user as AuthUser
    await ensureSupervisorOrAdmin(user)
    const usuarios = await prisma.usuario.findMany({
      where: { delegacion_id: user.deleg, activo: true, Rol: { codigo: 'TECNICO' } },
      select: usuarioSeguroSelect,
      orderBy: [{ apellidos: 'asc' }, { nombre: 'asc' }],
    })
    res.json(usuarios)
  } catch (error) { next(error) }
})

type AsignacionGuardiaInput = z.infer<typeof asignacionGuardiaInputSchema>

async function validarAsignacionesGuardia(
  tx: Prisma.TransactionClient,
  delegacionId: number,
  asignaciones: AsignacionGuardiaInput[],
) {
  const usuarioIds = asignaciones.map((a) => a.usuario_id)
  const rolGuardiaIds = asignaciones.map((a) => a.rol_guardia_id)

  if (new Set(usuarioIds).size !== usuarioIds.length) {
    const err = new Error('No se puede repetir un usuario en la misma guardia')
    ;(err as any).statusCode = 400
    throw err
  }

  if (new Set(rolGuardiaIds).size !== rolGuardiaIds.length) {
    const err = new Error('No se puede repetir un rol de guardia en la misma guardia')
    ;(err as any).statusCode = 400
    throw err
  }

  if (asignaciones.length === 0) {
    return
  }

  const usuarios = await tx.usuario.findMany({
    where: { id: { in: usuarioIds } },
    select: { id: true, delegacion_id: true, activo: true },
  })

  if (usuarios.length !== usuarioIds.length) {
    const err = new Error('Alguno de los usuarios no existe')
    ;(err as any).statusCode = 400
    throw err
  }

  const usuariosOtraDelegacion = usuarios.filter(
    (u: { delegacion_id: number }) => u.delegacion_id !== delegacionId,
  )
  if (usuariosOtraDelegacion.length > 0) {
    const err = new Error(
      'Todos los usuarios asignados deben pertenecer a la misma delegación que la guardia',
    )
    ;(err as any).statusCode = 400
    throw err
  }

  if (usuarios.some((usuario) => !usuario.activo)) {
    throw httpError('No se pueden asignar usuarios inactivos a una guardia', 400)
  }

  const roles = await tx.rolGuardia.findMany({
    where: { id: { in: rolGuardiaIds } },
    select: { id: true },
  })

  if (roles.length !== rolGuardiaIds.length) {
    const err = new Error('Alguno de los roles de guardia no existe')
    ;(err as any).statusCode = 400
    throw err
  }
}

router.get('/', async (req, res, next) => {
  try {
    const user = req.user

    if (!user) {
      return res.status(401).json({ error: 'No autenticado' })
    }

    const query = listarGuardiasQuerySchema.parse(req.query)

    const guardias = await prisma.guardia.findMany({
      where: { delegacion_id: user.deleg, ...guardiasEnRango(query) },
      orderBy: { fecha_inicio: 'asc' },
    })

    res.json(guardias)
  } catch (e) {
    next(e)
  }
})

router.get('/delegacion/:delegacionId', async (req, res, next) => {
  try {
    const user = req.user as AuthUser
    const delegacionId = Number(req.params.delegacionId)

    if (Number.isNaN(delegacionId)) {
      return res.status(400).json({ error: 'ID de delegación inválido' })
    }

    await ensureSupervisorOrAdmin(user)
    const rolCodigo = await getUserRoleCodigo(user)
    const isAdmin = isAdminCodigo(rolCodigo)

    if (!isAdmin && delegacionId !== user.deleg) {
      return res.status(403).json({ error: 'No puedes ver guardias de otra delegación' })
    }

    const query = listarGuardiasQuerySchema.parse(req.query)
    const guardias = await prisma.guardia.findMany({
      where: { delegacion_id: delegacionId, ...guardiasEnRango(query) },
      orderBy: { fecha_inicio: 'asc' },
    })

    res.json(guardias)
  } catch (e) {
    next(e)
  }
})

router.get('/mias', async (req, res, next) => {
  try {
    const user = req.user as AuthUser
    const query = listarGuardiasQuerySchema.parse(req.query)

    const asignaciones = await prisma.asignacionGuardia.findMany({
      where: {
        usuario_id: user.sub,
        Guardia: guardiasEnRango(query),
      },
      include: {
        Guardia: true,
        RolGuardia: true,
      },
      orderBy: {
        Guardia: {
          fecha_inicio: 'asc',
        },
      },
    })

    res.json(asignaciones)
  } catch (e) {
    next(e)
  }
})

router.get('/roles', async (_req, res, next) => {
  try {
    const roles = await prisma.rolGuardia.findMany({
      orderBy: { nombre: 'asc' },
    })

    res.json(roles)
  } catch (e) {
    next(e)
  }
})

router.get('/:id', async (req, res, next) => {
  try {
    const user = req.user as AuthUser
    const guardiaId = Number(req.params.id)

    if (Number.isNaN(guardiaId)) {
      return res.status(400).json({ error: 'ID de guardia inválido' })
    }

    const rolCodigo = await getUserRoleCodigo(user)
    const isAdmin = isAdminCodigo(rolCodigo)

    const guardia = await prisma.guardia.findUnique({
      where: { id: guardiaId },
      include: {
        Delegacion: true,
        Asignaciones: {
          where: isAdmin ? {} : { Usuario: { delegacion_id: user.deleg } },
          include: {
            Usuario: {
              select: usuarioSeguroSelect,
            },
            RolGuardia: true,
          },
        },
      },
    })

    if (!guardia) {
      return res.status(404).json({ error: 'Guardia no encontrada' })
    }

    if (!isAdmin && guardia.delegacion_id !== user.deleg) {
      return res.status(403).json({ error: 'No puedes ver guardias de otra delegación' })
    }

    res.json(guardia)
  } catch (e) {
    next(e)
  }
})

router.post('/', async (req, res, next) => {
  try {
    const user = req.user as AuthUser
    if (!user) {
      return res.status(401).json({ error: 'No autenticado' })
    }

    await ensureSupervisorOrAdmin(user)

    const dto = crearGuardiaSchema.parse(req.body)
    const ini = new Date(dto.fecha_inicio)
    const fin = new Date(dto.fecha_fin)
    const asignaciones = dto.asignaciones ?? []

    const created = await serializableTransaction(async (tx) => {
      const overlap = await tx.guardia.findFirst({
        where: {
          delegacion_id: user.deleg,
          AND: [{ fecha_inicio: { lt: fin } }, { fecha_fin: { gt: ini } }],
        },
      })
      if (overlap) throw httpError('Ya existe una guardia solapada en esta delegación', 400)

      await validarAsignacionesGuardia(tx, user.deleg, asignaciones)

      const guardia = await tx.guardia.create({
        data: {
          delegacion_id: user.deleg,
          fecha_inicio: ini,
          fecha_fin: fin,
          estado: dto.estado ?? 'PLANIFICADA',
          creado_por: user.sub,
        },
      })

      if (asignaciones.length > 0) {
        await tx.asignacionGuardia.createMany({
          data: asignaciones.map((a) => ({
            guardia_id: guardia.id,
            usuario_id: a.usuario_id,
            rol_guardia_id: a.rol_guardia_id,
          })),
        })
      }

      return guardia
    })

    const guardiaCreada = await prisma.guardia.findUnique({
      where: { id: created.id },
      include: {
        Delegacion: true,
        Asignaciones: {
          where: user.roleCode === 'ADMIN' ? {} : { Usuario: { delegacion_id: user.deleg } },
          include: {
            Usuario: {
              select: usuarioSeguroSelect,
            },
            RolGuardia: true,
          },
        },
      },
    })

    res.status(201).json(guardiaCreada)
  } catch (e) {
    next(e)
  }
})

router.patch('/:id', async (req, res, next) => {
  try {
    const user = req.user as AuthUser
    const guardiaId = Number(req.params.id)

    if (Number.isNaN(guardiaId)) {
      return res.status(400).json({ error: 'ID de guardia inválido' })
    }

    await ensureSupervisorOrAdmin(user)
    const dto = actualizarGuardiaSchema.parse(req.body)

    await serializableTransaction(async (tx) => {
      const guardia = await tx.guardia.findUnique({
        where: { id: guardiaId },
        include: { Asignaciones: true },
      })

      if (!guardia) {
        throw httpError('Guardia no encontrada', 404)
      }

      const rolCodigo = await getUserRoleCodigo(user)
      const isAdmin = isAdminCodigo(rolCodigo)

      if (!isAdmin && guardia.delegacion_id !== user.deleg) {
        throw httpError('No puedes modificar guardias de otra delegación', 403)
      }

      const nuevaFechaInicio = dto.fecha_inicio ? new Date(dto.fecha_inicio) : guardia.fecha_inicio
      const nuevaFechaFin = dto.fecha_fin ? new Date(dto.fecha_fin) : guardia.fecha_fin

      if (nuevaFechaFin <= nuevaFechaInicio) throw httpError('fecha_fin > fecha_inicio', 400)

      const overlap = await tx.guardia.findFirst({
        where: {
          delegacion_id: guardia.delegacion_id,
          id: { not: guardiaId },
          AND: [{ fecha_inicio: { lt: nuevaFechaFin } }, { fecha_fin: { gt: nuevaFechaInicio } }],
        },
      })

      if (overlap) {
        throw httpError('Las nuevas fechas solapan con otra guardia de esta delegación', 400)
      }

      if (dto.asignaciones || dto.fecha_inicio || dto.fecha_fin) {
        await validarAsignacionesGuardia(
          tx,
          guardia.delegacion_id,
          dto.asignaciones ?? guardia.Asignaciones,
        )
      }

      if (dto.asignaciones) {
        const asignaciones = dto.asignaciones

        await tx.guardia.update({
          where: { id: guardiaId },
          data: {
            fecha_inicio: nuevaFechaInicio,
            fecha_fin: nuevaFechaFin,
            estado: dto.estado ?? guardia.estado,
          },
        })

        await tx.asignacionGuardia.deleteMany({
          where: { guardia_id: guardiaId },
        })

        if (asignaciones.length > 0) {
          await tx.asignacionGuardia.createMany({
            data: asignaciones.map((a) => ({
              guardia_id: guardiaId,
              usuario_id: a.usuario_id,
              rol_guardia_id: a.rol_guardia_id,
            })),
          })
        }
      } else {
        await tx.guardia.update({
          where: { id: guardiaId },
          data: {
            fecha_inicio: nuevaFechaInicio,
            fecha_fin: nuevaFechaFin,
            estado: dto.estado ?? guardia.estado,
          },
        })
      }
    })

    const guardiaActualizada = await prisma.guardia.findUnique({
      where: { id: guardiaId },
      include: {
        Delegacion: true,
        Asignaciones: {
          where: user.roleCode === 'ADMIN' ? {} : { Usuario: { delegacion_id: user.deleg } },
          include: {
            Usuario: {
              select: usuarioSeguroSelect,
            },
            RolGuardia: true,
          },
        },
      },
    })

    res.json(guardiaActualizada)
  } catch (e: any) {
    if (e?.statusCode) {
      return res.status(e.statusCode).json({ error: e.message })
    }
    next(e)
  }
})

router.post('/:id/asignaciones', async (req, res, next) => {
  try {
    const user = req.user as AuthUser
    const guardiaId = Number(req.params.id)

    if (Number.isNaN(guardiaId)) {
      return res.status(400).json({ error: 'ID de guardia inválido' })
    }

    await ensureSupervisorOrAdmin(user)
    const rolCodigo = await getUserRoleCodigo(user)
    const isAdmin = isAdminCodigo(rolCodigo)

    const dto = asignacionGuardiaSchema.parse(req.body)

    const asignacion = await serializableTransaction(async (tx) => {
      const guardia = await tx.guardia.findUnique({
        where: { id: guardiaId },
      })

      if (!guardia) {
        throw httpError('Guardia no encontrada', 404)
      }

      if (!isAdmin && guardia.delegacion_id !== user.deleg) {
        throw httpError('No puedes modificar guardias de otra delegación', 403)
      }

      await validarAsignacionesGuardia(tx, guardia.delegacion_id, [dto])

      return tx.asignacionGuardia.create({
        data: {
          guardia_id: guardia.id,
          usuario_id: dto.usuario_id,
          rol_guardia_id: dto.rol_guardia_id,
        },
        include: {
          Usuario: {
            select: usuarioSeguroSelect,
          },
          RolGuardia: true,
        },
      })
    })

    res.status(201).json(asignacion)
  } catch (e: any) {
    next(e)
  }
})

export default router
