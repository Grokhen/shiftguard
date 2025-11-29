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

async function getUserRoleCodigo(user: AuthUser): Promise<string | null> {
  const rol = await prisma.rolUsuario.findUnique({
    where: { id: user.role },
  })
  return rol?.codigo ?? null
}

async function ensureAdmin(user: AuthUser) {
  const codigo = await getUserRoleCodigo(user)
  if (codigo !== 'ADMIN') {
    const err = new Error('Acción reservada a administradores')
    ;(err as any).statusCode = 403
    throw err
  }
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

const crearEquipoSchema = z.object({
  nombre_equipo: z.string().min(1).max(120),
  delegacion_id: z.number().int().positive(),
})

const editarEquipoSchema = z.object({
  nombre_equipo: z.string().min(1).max(120).optional(),
  delegacion_id: z.number().int().positive().optional(),
})

const miembroEquipoSchema = z.object({
  usuario_id: z.number().int().positive(),
})

const listarEquiposQuerySchema = z.object({
  delegacion_id: z.coerce.number().int().optional(),
})

const listarPermisosEquipoQuerySchema = z.object({
  anio: z.coerce.number().int().optional(),
})

router.post('/', async (req, res, next) => {
  try {
    const user = req.user as AuthUser
    await ensureAdmin(user)

    const dto = crearEquipoSchema.parse(req.body)

    const delegacion = await prisma.delegacion.findUnique({
      where: { id: dto.delegacion_id },
    })
    if (!delegacion) {
      return res.status(400).json({ error: `Delegación no encontrada: ${dto.delegacion_id}` })
    }

    const equipo = await prisma.equipo.create({
      data: {
        nombre_equipo: dto.nombre_equipo,
        delegacion_id: dto.delegacion_id,
      },
    })

    res.status(201).json(equipo)
  } catch (e) {
    next(e)
  }
})

router.get('/:id', async (req, res, next) => {
  try {
    const user = req.user as AuthUser
    await ensureSupervisorOrAdmin(user)

    const equipoId = Number(req.params.id)
    if (Number.isNaN(equipoId)) {
      return res.status(400).json({ error: 'ID de equipo inválido' })
    }

    const equipo = await prisma.equipo.findUnique({
      where: { id: equipoId },
      include: {
        Miembros: {
          include: {
            Usuario: true,
          },
        },
      },
    })

    if (!equipo) {
      return res.status(404).json({ error: 'Equipo no encontrado' })
    }

    const rolCodigo = await getUserRoleCodigo(user)
    const isAdmin = isAdminCodigo(rolCodigo)

    if (!isAdmin && equipo.delegacion_id !== user.deleg) {
      return res.status(403).json({ error: 'No puedes consultar equipos de otra delegación' })
    }

    res.json(equipo)
  } catch (e) {
    next(e)
  }
})

router.patch('/:id', async (req, res, next) => {
  try {
    const user = req.user as AuthUser
    await ensureAdmin(user)

    const equipoId = Number(req.params.id)
    if (Number.isNaN(equipoId)) {
      return res.status(400).json({ error: 'ID de equipo inválido' })
    }

    const dto = editarEquipoSchema.parse(req.body)

    const equipo = await prisma.equipo.update({
      where: { id: equipoId },
      data: dto,
    })

    res.json(equipo)
  } catch (e) {
    next(e)
  }
})

router.post('/:id/miembros', async (req, res, next) => {
  try {
    const user = req.user as AuthUser
    await ensureSupervisorOrAdmin(user)

    const equipoId = Number(req.params.id)
    if (Number.isNaN(equipoId)) {
      return res.status(400).json({ error: 'ID de equipo inválido' })
    }

    const dto = miembroEquipoSchema.parse(req.body)

    const equipo = await prisma.equipo.findUnique({
      where: { id: equipoId },
    })
    if (!equipo) {
      return res.status(404).json({ error: 'Equipo no encontrado' })
    }

    const rolCodigo = await getUserRoleCodigo(user)
    const isAdmin = isAdminCodigo(rolCodigo)

    if (!isAdmin && equipo.delegacion_id !== user.deleg) {
      return res.status(403).json({ error: 'No puedes modificar equipos de otra delegación' })
    }

    const usuario = await prisma.usuario.findUnique({
      where: { id: dto.usuario_id },
      select: { id: true, delegacion_id: true },
    })
    if (!usuario) {
      return res.status(400).json({ error: `Usuario no encontrado: ${dto.usuario_id}` })
    }

    if (usuario.delegacion_id !== equipo.delegacion_id) {
      return res.status(400).json({
        error: 'Usuario y equipo deben pertenecer a la misma delegación',
      })
    }

    const miembro = await prisma.miembroEquipo.create({
      data: {
        equipo_id: equipo.id,
        usuario_id: dto.usuario_id,
      },
    })

    res.status(201).json(miembro)
  } catch (e) {
    next(e)
  }
})

router.delete('/:id/miembros/:usuarioId', async (req, res, next) => {
  try {
    const user = req.user as AuthUser
    await ensureSupervisorOrAdmin(user)

    const equipoId = Number(req.params.id)
    const usuarioId = Number(req.params.usuarioId)

    if (Number.isNaN(equipoId) || Number.isNaN(usuarioId)) {
      return res.status(400).json({ error: 'ID de equipo o usuario inválido' })
    }

    const equipo = await prisma.equipo.findUnique({
      where: { id: equipoId },
    })
    if (!equipo) {
      return res.status(404).json({ error: 'Equipo no encontrado' })
    }

    const rolCodigo = await getUserRoleCodigo(user)
    const isAdmin = isAdminCodigo(rolCodigo)

    if (!isAdmin && equipo.delegacion_id !== user.deleg) {
      return res.status(403).json({ error: 'No puedes modificar equipos de otra delegación' })
    }

    await prisma.miembroEquipo.delete({
      where: {
        equipo_id_usuario_id: {
          equipo_id: equipoId,
          usuario_id: usuarioId,
        },
      },
    })

    res.status(204).send()
  } catch (e) {
    next(e)
  }
})

router.get('/:id/permisos', async (req, res, next) => {
  try {
    const user = req.user as AuthUser
    await ensureSupervisorOrAdmin(user)

    const equipoId = Number(req.params.id)
    if (Number.isNaN(equipoId)) {
      return res.status(400).json({ error: 'ID de equipo inválido' })
    }

    const query = listarPermisosEquipoQuerySchema.parse(req.query)

    const equipo = await prisma.equipo.findUnique({
      where: { id: equipoId },
    })
    if (!equipo) {
      return res.status(404).json({ error: 'Equipo no encontrado' })
    }

    const rolCodigo = await getUserRoleCodigo(user)
    const isAdmin = isAdminCodigo(rolCodigo)

    if (!isAdmin && equipo.delegacion_id !== user.deleg) {
      return res.status(403).json({ error: 'No puedes consultar equipos de otra delegación' })
    }

    const miembros = await prisma.miembroEquipo.findMany({
      where: { equipo_id: equipoId },
      select: { usuario_id: true },
    })

    const idsUsuarios = miembros.map((m) => m.usuario_id)
    if (idsUsuarios.length === 0) {
      return res.json([])
    }

    const where: any = {
      usuario_id: { in: idsUsuarios },
    }

    if (query.anio) {
      const from = new Date(query.anio, 0, 1)
      const to = new Date(query.anio, 11, 31)
      where.fecha_inicio = { gte: from, lte: to }
    }

    const permisos = await prisma.permiso.findMany({
      where,
      include: {
        Usuario: true,
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

router.get('/', async (req, res, next) => {
  try {
    const user = req.user as AuthUser
    const query = listarEquiposQuerySchema.parse(req.query)

    const rolCodigo = await getUserRoleCodigo(user)
    const isAdmin = isAdminCodigo(rolCodigo)

    const where: any = {}

    if (isAdmin) {
      if (query.delegacion_id) {
        where.delegacion_id = query.delegacion_id
      }
    } else {
      where.delegacion_id = user.deleg
    }

    const equipos = await prisma.equipo.findMany({
      where,
      orderBy: { nombre_equipo: 'asc' },
    })

    res.json(equipos)
  } catch (e) {
    next(e)
  }
})

export default router
