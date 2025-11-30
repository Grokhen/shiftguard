import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../../prisma'
import { authRequired } from '../../middlewares/authRequired'

const router = Router()

router.use(authRequired)

type AuthUser = {
  sub: number
  role: number
  deleg: number
}

const iso = z.string().refine((v) => !Number.isNaN(Date.parse(v)), 'Fecha inválida')

const crearPermisoSchema = z
  .object({
    tipo_id: z.number().int().positive(),
    fecha_inicio: iso,
    fecha_fin: iso,
    observaciones: z.string().max(500).optional(),
  })
  .refine((d) => new Date(d.fecha_fin) >= new Date(d.fecha_inicio), {
    path: ['fecha_fin'],
    message: 'fecha_fin >= fecha_inicio',
  })

const listarMisPermisosQuerySchema = z.object({
  anio: z.coerce.number().int().optional(), // ?anio=2025
  tipo_id: z.coerce.number().int().optional(), // ?tipo_id=1
  estado_id: z.coerce.number().int().optional(), // ?estado_id=2
})

const decidirPermisoSchema = z.object({
  estado_id: z.number().int().positive(),
  observaciones: z.string().max(500).optional(),
})

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

router.get('/tipos', async (_req, res, next) => {
  try {
    const tipos = await prisma.tipoPermiso.findMany({
      orderBy: { nombre: 'asc' },
    })
    res.json(tipos)
  } catch (e) {
    next(e)
  }
})

router.get('/estados', async (_req, res, next) => {
  try {
    const estados = await prisma.estadoPermiso.findMany({
      orderBy: { nombre: 'asc' },
    })
    res.json(estados)
  } catch (e) {
    next(e)
  }
})

router.get('/mios', async (req, res, next) => {
  try {
    const user = req.user as AuthUser

    const query = listarMisPermisosQuerySchema.parse(req.query)

    const where: any = {
      usuario_id: user.sub,
    }

    if (query.anio) {
      const from = new Date(query.anio, 0, 1)
      const to = new Date(query.anio, 11, 31)
      where.fecha_inicio = { gte: from, lte: to }
    }

    if (query.tipo_id) {
      where.tipo_id = query.tipo_id
    }

    if (query.estado_id) {
      where.estado_id = query.estado_id
    }

    const permisos = await prisma.permiso.findMany({
      where,
      include: {
        Tipo: true,
        Estado: true,
      },
      orderBy: { fecha_inicio: 'desc' },
    })

    res.json(permisos)
  } catch (e) {
    next(e)
  }
})

router.get('/usuario/:id', async (req, res, next) => {
  try {
    const authUser = req.user as AuthUser
    const usuarioId = Number(req.params.id)

    if (Number.isNaN(usuarioId)) {
      return res.status(400).json({ error: 'ID de usuario inválido' })
    }

    await ensureSupervisorOrAdmin(authUser)

    const usuario = await prisma.usuario.findUnique({
      where: { id: usuarioId },
      select: { id: true, delegacion_id: true },
    })

    if (!usuario) {
      return res.status(404).json({ error: 'Usuario no encontrado' })
    }

    const rolCodigo = await getUserRoleCodigo(authUser)
    const isAdmin = rolCodigo === 'ADMIN'

    if (!isAdmin && usuario.delegacion_id !== authUser.deleg) {
      return res.status(403).json({ error: 'No puedes consultar permisos de otra delegación' })
    }

    const permisos = await prisma.permiso.findMany({
      where: { usuario_id: usuarioId },
      include: {
        Tipo: true,
        Estado: true,
      },
      orderBy: { fecha_inicio: 'desc' },
    })

    res.json(permisos)
  } catch (e) {
    next(e)
  }
})

router.post('/', async (req, res, next) => {
  try {
    const user = req.user as AuthUser

    const dto = crearPermisoSchema.parse(req.body)

    const tipo = await prisma.tipoPermiso.findUnique({
      where: { id: dto.tipo_id },
    })

    if (!tipo) {
      return res.status(400).json({ error: `Tipo de permiso no válido: ${dto.tipo_id}` })
    }

    const estadoPendiente = await prisma.estadoPermiso.findUnique({
      where: { codigo: 'PENDIENTE' },
    })

    if (!estadoPendiente) {
      return res
        .status(500)
        .json({ error: 'No existe el estado PENDIENTE en la base de datos. Revisa el seed.' })
    }

    const created = await prisma.permiso.create({
      data: {
        usuario_id: user.sub,
        tipo_id: dto.tipo_id,
        estado_id: estadoPendiente.id,
        fecha_inicio: new Date(dto.fecha_inicio),
        fecha_fin: new Date(dto.fecha_fin),
        observaciones: dto.observaciones,
        creado_por: user.sub,
      },
      include: {
        Tipo: true,
        Estado: true,
      },
    })

    res.status(201).json(created)
  } catch (e) {
    next(e)
  }
})

router.patch('/:id/decidir', async (req, res, next) => {
  try {
    const user = req.user as AuthUser
    const permisoId = Number(req.params.id)

    if (Number.isNaN(permisoId)) {
      return res.status(400).json({ error: 'ID de permiso inválido' })
    }

    const dto = decidirPermisoSchema.parse(req.body)

    await ensureSupervisorOrAdmin(user)

    const permiso = await prisma.permiso.findUnique({
      where: { id: permisoId },
      include: {
        Estado: true,
      },
    })

    if (!permiso) {
      return res.status(404).json({ error: 'Permiso no encontrado' })
    }

    if (permiso.Estado.codigo !== 'PENDIENTE') {
      return res.status(400).json({
        error: `No se puede cambiar un permiso en estado ${permiso.Estado.codigo}`,
      })
    }

    const nuevoEstado = await prisma.estadoPermiso.findUnique({
      where: { id: dto.estado_id },
    })

    if (!nuevoEstado) {
      return res.status(400).json({
        error: `Estado de permiso no válido: ${dto.estado_id}`,
      })
    }

    if (nuevoEstado.codigo === 'PENDIENTE') {
      return res.status(400).json({
        error: 'No se puede volver a poner el permiso en estado PENDIENTE',
      })
    }

    const actualizado = await prisma.permiso.update({
      where: { id: permisoId },
      data: {
        estado_id: nuevoEstado.id,
        decidido_por: user.sub,
        observaciones: dto.observaciones ?? permiso.observaciones,
      },
      include: {
        Tipo: true,
        Estado: true,
      },
    })

    res.json(actualizado)
  } catch (e: any) {
    if (e?.statusCode) {
      return res.status(e.statusCode).json({ error: e.message })
    }
    next(e)
  }
})

export default router
