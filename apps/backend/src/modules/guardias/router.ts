import { Router } from 'express'
import type { Prisma } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '../../prisma'
import { authRequired } from '../../middlewares/authRequired'
import {
  ensureSupervisorOrAdmin,
  getUserRoleCodigo,
  isAdminCodigo,
  type AuthUser,
} from '../../utils/authz'

const router = Router()

router.use(authRequired)

const iso = z.string().refine((v) => !Number.isNaN(Date.parse(v)), 'Fecha inválida')

const asignacionGuardiaInputSchema = z.object({
  usuario_id: z.number().int().positive(),
  rol_guardia_id: z.number().int().positive(),
})

const crearGuardiaSchema = z
  .object({
    fecha_inicio: iso,
    fecha_fin: iso,
    estado: z.string().max(20).optional(),
    asignaciones: z.array(asignacionGuardiaInputSchema).optional(),
  })
  .refine((d) => new Date(d.fecha_fin) > new Date(d.fecha_inicio), {
    path: ['fecha_fin'],
    message: 'fecha_fin > fecha_inicio',
  })

const listarGuardiasQuerySchema = z.object({
  desde: iso.optional(),
  hasta: iso.optional(),
})

const listarMisGuardiasQuerySchema = z.object({
  desde: iso.optional(),
  hasta: iso.optional(),
})

const asignacionGuardiaSchema = asignacionGuardiaInputSchema

const actualizarGuardiaSchema = z
  .object({
    fecha_inicio: iso.optional(),
    fecha_fin: iso.optional(),
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

type AsignacionGuardiaInput = z.infer<typeof asignacionGuardiaInputSchema>

async function validarAsignacionesGuardia(
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

  const usuarios = await prisma.usuario.findMany({
    where: { id: { in: usuarioIds } },
    select: { id: true, delegacion_id: true },
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

  const roles = await prisma.rolGuardia.findMany({
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

    const where: any = { delegacion_id: user.deleg }

    if (query.desde || query.hasta) {
      where.fecha_inicio = {}
      if (query.desde) where.fecha_inicio.gte = new Date(query.desde)
      if (query.hasta) where.fecha_inicio.lte = new Date(query.hasta)
    }

    const guardias = await prisma.guardia.findMany({
      where,
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

    const guardias = await prisma.guardia.findMany({
      where: { delegacion_id: delegacionId },
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
    const query = listarMisGuardiasQuerySchema.parse(req.query)

    const guardiaFilter: any = {}

    if (query.desde || query.hasta) {
      guardiaFilter.fecha_inicio = {}
      if (query.desde) guardiaFilter.fecha_inicio.gte = new Date(query.desde)
      if (query.hasta) guardiaFilter.fecha_inicio.lte = new Date(query.hasta)
    }

    const asignaciones = await prisma.asignacionGuardia.findMany({
      where: {
        usuario_id: user.sub,
        Guardia: guardiaFilter,
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

    const overlap = await prisma.guardia.findFirst({
      where: {
        delegacion_id: user.deleg,
        AND: [{ fecha_inicio: { lt: fin } }, { fecha_fin: { gt: ini } }],
      },
    })
    if (overlap)
      return res.status(400).json({ error: 'Ya existe una guardia solapada en esta delegación' })

    await validarAsignacionesGuardia(user.deleg, asignaciones)

    const created = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
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

    const guardia = await prisma.guardia.findUnique({
      where: { id: guardiaId },
    })

    if (!guardia) {
      return res.status(404).json({ error: 'Guardia no encontrada' })
    }

    const rolCodigo = await getUserRoleCodigo(user)
    const isAdmin = isAdminCodigo(rolCodigo)

    if (!isAdmin && guardia.delegacion_id !== user.deleg) {
      return res.status(403).json({ error: 'No puedes modificar guardias de otra delegación' })
    }

    const nuevaFechaInicio = dto.fecha_inicio ? new Date(dto.fecha_inicio) : guardia.fecha_inicio
    const nuevaFechaFin = dto.fecha_fin ? new Date(dto.fecha_fin) : guardia.fecha_fin

    const overlap = await prisma.guardia.findFirst({
      where: {
        delegacion_id: guardia.delegacion_id,
        id: { not: guardiaId },
        AND: [{ fecha_inicio: { lt: nuevaFechaFin } }, { fecha_fin: { gt: nuevaFechaInicio } }],
      },
    })

    if (overlap) {
      return res.status(400).json({
        error: 'Las nuevas fechas solapan con otra guardia de esta delegación',
      })
    }

    if (dto.asignaciones) {
      const asignaciones = dto.asignaciones

      await validarAsignacionesGuardia(guardia.delegacion_id, asignaciones)

      await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
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
      })
    } else {
      await prisma.guardia.update({
        where: { id: guardiaId },
        data: {
          fecha_inicio: nuevaFechaInicio,
          fecha_fin: nuevaFechaFin,
          estado: dto.estado ?? guardia.estado,
        },
      })
    }

    const guardiaActualizada = await prisma.guardia.findUnique({
      where: { id: guardiaId },
      include: {
        Delegacion: true,
        Asignaciones: {
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

    const guardia = await prisma.guardia.findUnique({
      where: { id: guardiaId },
    })

    if (!guardia) {
      return res.status(404).json({ error: 'Guardia no encontrada' })
    }

    if (!isAdmin && guardia.delegacion_id !== user.deleg) {
      return res.status(403).json({ error: 'No puedes modificar guardias de otra delegación' })
    }

    const usuario = await prisma.usuario.findUnique({
      where: { id: dto.usuario_id },
      select: { id: true, delegacion_id: true },
    })

    if (!usuario) {
      return res.status(400).json({ error: `Usuario no encontrado: ${dto.usuario_id}` })
    }

    if (usuario.delegacion_id !== guardia.delegacion_id) {
      return res.status(400).json({
        error: 'El usuario y la guardia deben pertenecer a la misma delegación',
      })
    }

    const rolGuardia = await prisma.rolGuardia.findUnique({
      where: { id: dto.rol_guardia_id },
    })

    if (!rolGuardia) {
      return res.status(400).json({
        error: `Rol de guardia no válido: ${dto.rol_guardia_id}`,
      })
    }

    const asignacion = await prisma.asignacionGuardia.create({
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

    res.status(201).json(asignacion)
  } catch (e: any) {
    next(e)
  }
})

export default router
