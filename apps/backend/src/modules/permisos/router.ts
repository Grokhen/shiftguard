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

// ---------- GET catálogos: tipos y estados ----------

/**
 * GET /api/permisos/tipos
 * Devuelve el catálogo de tipos de permiso.
 */
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

/**
 * GET /api/permisos/estados
 * Devuelve el catálogo de estados de permiso.
 */
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

// ---------- GET /api/permisos/mios ----------

/**
  Lista los permisos del usuario autenticado.
  Filtros opcionales: anio, tipo_id, estado_id.
 */
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

// ---------- POST /api/permisos ----------

/**
 Crea un permiso para el usuario autenticado.
  - usuario_id = req.user.sub (no viene del cliente)
  - estado_id = ID del estado PENDIENTE (buscado en EstadoPermiso)
 */
router.post('/', async (req, res, next) => {
  try {
    const user = req.user as AuthUser

    const dto = crearPermisoSchema.parse(req.body)

    // Comprobamos que el tipo existe
    const tipo = await prisma.tipoPermiso.findUnique({
      where: { id: dto.tipo_id },
    })

    if (!tipo) {
      return res.status(400).json({ error: `Tipo de permiso no válido: ${dto.tipo_id}` })
    }

    // Estado inicial siempre PENDIENTE
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

// ---------- PATCH /api/permisos/:id/decidir ----------

/**
  Cambia el estado de un permiso (APROBADO, RECHAZADO, CANCELADO, etc.).
  - Solo puede usarlo SUPERVISOR o ADMIN.
  - Solo permite cambiar permisos que están en estado PENDIENTE.
 */
router.patch('/:id/decidir', async (req, res, next) => {
  try {
    const user = req.user as AuthUser
    const permisoId = Number(req.params.id)

    if (Number.isNaN(permisoId)) {
      return res.status(400).json({ error: 'ID de permiso inválido' })
    }

    const dto = decidirPermisoSchema.parse(req.body)

    // 1) Comprobar rol del usuario (SUPERVISOR / ADMIN)
    await ensureSupervisorOrAdmin(user)

    // 2) Cargar el permiso actual con su estado
    const permiso = await prisma.permiso.findUnique({
      where: { id: permisoId },
      include: {
        Estado: true,
      },
    })

    if (!permiso) {
      return res.status(404).json({ error: 'Permiso no encontrado' })
    }

    // (opcional) Podrías comprobar también que pertenece a la misma delegación:
    // const usuarioPermiso = await prisma.usuario.findUnique({ where: { id: permiso.usuario_id } })
    // if (usuarioPermiso?.delegacion_id !== user.deleg) { ... }

    // 3) Regla de negocio: solo se puede decidir si el permiso está PENDIENTE
    if (permiso.Estado.codigo !== 'PENDIENTE') {
      return res.status(400).json({
        error: `No se puede cambiar un permiso en estado ${permiso.Estado.codigo}`,
      })
    }

    // 4) Comprobar que el nuevo estado existe
    const nuevoEstado = await prisma.estadoPermiso.findUnique({
      where: { id: dto.estado_id },
    })

    if (!nuevoEstado) {
      return res.status(400).json({
        error: `Estado de permiso no válido: ${dto.estado_id}`,
      })
    }

    // Evitar volver a PENDIENTE
    if (nuevoEstado.codigo === 'PENDIENTE') {
      return res.status(400).json({
        error: 'No se puede volver a poner el permiso en estado PENDIENTE',
      })
    }

    // 5) Actualizar permiso
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
    // Si es un error de ensureSupervisorOrAdmin con statusCode, respóndelo bien
    if (e?.statusCode) {
      return res.status(e.statusCode).json({ error: e.message })
    }
    next(e)
  }
})

export default router
