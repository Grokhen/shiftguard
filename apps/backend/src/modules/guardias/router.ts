import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../../prisma'
import { authRequired } from '../../middlewares/authRequired'

const router = Router()

type AuthUser = {
  sub: number
  role: number
  deleg: number
}

async function getUserRoleCodigo(user: AuthUser): Promise<string | null> {
  const rol = await prisma.rolUsuario.findUnique({
    where: { id: user.role },
  })
  return rol?.codigo ?? null
}

async function ensureSupervisorOrAdmin(user: AuthUser) {
  const codigo = await getUserRoleCodigo(user)
  if (!codigo) {
    const err = new Error('Rol de usuario no encontrado')
    ;(err as any).statusCode = 500
    throw err
  }
  if (!['SUPERVISOR', 'ADMIN'].includes(codigo)) {
    const err = new Error('No tienes permisos para realizar esta acción')
    ;(err as any).statusCode = 403
    throw err
  }
}

function isAdminCodigo(codigo: string | null) {
  return codigo === 'ADMIN'
}

router.use(authRequired)

const iso = z.string().refine((v) => !Number.isNaN(Date.parse(v)), 'Fecha inválida')

const crearGuardiaSchema = z
  .object({
    fecha_inicio: iso,
    fecha_fin: iso,
    estado: z.string().max(20).optional(),
  })
  .refine((d) => new Date(d.fecha_fin) > new Date(d.fecha_inicio), {
    path: ['fecha_fin'],
    message: 'fecha_fin > fecha_inicio',
  })

const listarGuardiasQuerySchema = z.object({
  desde: iso.optional(),
  hasta: iso.optional(),
})

const asignacionGuardiaSchema = z.object({
  usuario_id: z.number().int().positive(),
  rol_guardia_id: z.number().int().positive(),
})

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

router.post('/', authRequired, async (req, res, next) => {
  try {
    const user = req.user
    if (!user) {
      return res.status(401).json({ error: 'No autenticado' })
    }
    const dto = crearGuardiaSchema.parse(req.body)
    const ini = new Date(dto.fecha_inicio)
    const fin = new Date(dto.fecha_fin)

    const overlap = await prisma.guardia.findFirst({
      where: {
        delegacion_id: user.deleg,
        AND: [{ fecha_inicio: { lt: fin } }, { fecha_fin: { gt: ini } }],
      },
    })
    if (overlap)
      return res.status(400).json({ error: 'Ya existe una guardia solapada en esta delegación' })

    const created = await prisma.guardia.create({
      data: {
        delegacion_id: user.deleg,
        fecha_inicio: ini,
        fecha_fin: fin,
        estado: dto.estado ?? 'PLANIFICADA',
      },
    })
    res.status(201).json(created)
  } catch (e) {
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
        Usuario: true,
        RolGuardia: true,
      },
    })

    res.status(201).json(asignacion)
  } catch (e: any) {
    next(e)
  }
})

export default router
