import { Router, type Request, type Response, type NextFunction } from 'express'
import { z } from 'zod'
import argon2 from 'argon2'
import { prisma } from '../../prisma'
import { authRequired, passwordChangeAuth } from '../../middlewares/authRequired'
import { ENV } from '../../config/env'
import { ensureAdmin, type AuthUser } from '../../utils/authz'
import { serializableTransaction } from '../../utils/transaction'
import { httpError } from '../../utils/httpError'

const router = Router()

// Register the two recovery routes before enforcing password changes everywhere else.
router.get('/me', passwordChangeAuth, getOwnProfile)
router.patch('/me/password', passwordChangeAuth, changeOwnPassword)
router.use(authRequired)

const crearUsuarioSchema = z.object({
  nombre: z.string().min(1).max(100),
  apellidos: z.string().min(1).max(150),
  email: z.email(),
  password: z.string().min(8),
  rol_id: z.number().int().positive(),
  delegacion_id: z.number().int().positive(),
  activo: z.boolean().optional(),
})

const editarUsuarioSchema = z.object({
  nombre: z.string().min(1).max(100).optional(),
  apellidos: z.string().min(1).max(150).optional(),
  email: z.email().optional(),
  rol_id: z.number().int().positive().optional(),
  delegacion_id: z.number().int().positive().optional(),
  activo: z.boolean().optional(),
  requiere_reset: z.literal(true).optional(),
  password: z.string().min(8).optional(),
})

const listarUsuariosQuerySchema = z.object({
  delegacion_id: z.coerce.number().int().optional(),
  rol_id: z.coerce.number().int().optional(),
  activo: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
})

const editarPerfilPropioSchema = z.object({
  nombre: z.string().min(1).max(100).optional(),
  apellidos: z.string().min(1).max(150).optional(),
})

const cambiarPasswordSchema = z.object({
  password_actual: z.string().min(8),
  password_nueva: z.string().min(8),
})

const usuarioSeguroSelect = {
  id: true,
  nombre: true,
  apellidos: true,
  email: true,
  delegacion_id: true,
  rol_id: true,
  activo: true,
  requiere_reset: true,
  ultimo_login: true,
  password_actualizada_en: true,
  fecha_creacion: true,
  fecha_actualizacion: true,
} as const

router.post('/', async (req, res, next) => {
  try {
    const authUser = req.user as AuthUser
    await ensureAdmin(authUser)

    const dto = crearUsuarioSchema.parse(req.body)

    const [rol, delegacion] = await Promise.all([
      prisma.rolUsuario.findUnique({ where: { id: dto.rol_id } }),
      prisma.delegacion.findUnique({ where: { id: dto.delegacion_id } }),
    ])

    if (!rol) return res.status(400).json({ error: `Rol no encontrado: ${dto.rol_id}` })
    if (!delegacion) {
      return res.status(400).json({ error: `Delegación no encontrada: ${dto.delegacion_id}` })
    }

    const hash = await argon2.hash(dto.password + ENV.AUTH_PEPPER)

    const usuario = await prisma.usuario.create({
      data: {
        nombre: dto.nombre,
        apellidos: dto.apellidos,
        email: dto.email,
        password_hash: hash,
        rol_id: dto.rol_id,
        delegacion_id: dto.delegacion_id,
        activo: dto.activo ?? true,
        requiere_reset: true,
      },
      select: usuarioSeguroSelect,
    })

    res.status(201).json(usuario)
  } catch (e) {
    next(e)
  }
})

router.get('/', async (req, res, next) => {
  try {
    const authUser = req.user as AuthUser
    await ensureAdmin(authUser)

    const query = listarUsuariosQuerySchema.parse(req.query)

    const where: any = {}

    if (query.delegacion_id) where.delegacion_id = query.delegacion_id
    if (query.rol_id) where.rol_id = query.rol_id
    if (typeof query.activo === 'boolean') where.activo = query.activo

    const usuarios = await prisma.usuario.findMany({
      where,
      orderBy: { apellidos: 'asc' },
      select: usuarioSeguroSelect,
    })

    res.json(usuarios)
  } catch (e) {
    next(e)
  }
})

async function getOwnProfile(req: Request, res: Response, next: NextFunction) {
  try {
    const authUser = req.user as AuthUser

    const usuario = await prisma.usuario.findUnique({
      where: { id: authUser.sub },
      select: usuarioSeguroSelect,
    })

    if (!usuario) {
      return res.status(404).json({ error: 'Usuario no encontrado' })
    }

    res.json(usuario)
  } catch (e) {
    next(e)
  }
}

router.patch('/me', async (req, res, next) => {
  try {
    const authUser = req.user as AuthUser

    const dto = editarPerfilPropioSchema.parse(req.body)

    const usuario = await prisma.usuario.update({
      where: { id: authUser.sub },
      data: dto,
      select: usuarioSeguroSelect,
    })

    res.json(usuario)
  } catch (e) {
    next(e)
  }
})

async function changeOwnPassword(req: Request, res: Response, next: NextFunction) {
  try {
    const authUser = req.user as AuthUser

    const dto = cambiarPasswordSchema.parse(req.body)
    if (dto.password_nueva === dto.password_actual) {
      return res.status(400).json({ error: 'La nueva contraseña debe ser distinta de la actual.' })
    }

    const usuario = await prisma.usuario.findUnique({
      where: { id: authUser.sub },
      select: {
        id: true,
        password_hash: true,
        password_actualizada_en: true,
      },
    })

    if (!usuario || !usuario.password_hash) {
      return res.status(400).json({ error: 'No hay contraseña definida para este usuario' })
    }

    const ok = await argon2.verify(usuario.password_hash, dto.password_actual + ENV.AUTH_PEPPER)
    if (!ok) {
      return res.status(400).json({ error: 'Contraseña actual incorrecta' })
    }

    const nuevoHash = await argon2.hash(dto.password_nueva + ENV.AUTH_PEPPER)

    const changed = await prisma.usuario.updateMany({
      where: { id: authUser.sub, password_hash: usuario.password_hash },
      data: {
        password_hash: nuevoHash,
        password_actualizada_en: new Date(
          Math.max(Date.now(), (usuario.password_actualizada_en?.getTime() ?? 0) + 1),
        ),
        requiere_reset: false,
      },
    })

    if (changed.count !== 1)
      throw httpError('La contraseña ha cambiado. Inicia sesión de nuevo.', 409)

    res.status(204).send()
  } catch (e) {
    next(e)
  }
}

router.patch('/:id', async (req, res, next) => {
  try {
    const authUser = req.user as AuthUser
    await ensureAdmin(authUser)

    const usuarioId = Number(req.params.id)
    if (Number.isNaN(usuarioId)) {
      return res.status(400).json({ error: 'ID de usuario inválido' })
    }

    const dto = editarUsuarioSchema.parse(req.body)

    const { password, ...changes } = dto
    // Keep password hashing outside the transaction/retry loop.
    const hash = password ? await argon2.hash(password + ENV.AUTH_PEPPER) : undefined

    const usuario = await serializableTransaction(async (tx) => {
      const current = await tx.usuario.findUnique({ where: { id: usuarioId } })
      if (!current) throw httpError('Usuario no encontrado', 404)

      if (dto.rol_id !== undefined) {
        const rol = await tx.rolUsuario.findUnique({ where: { id: dto.rol_id } })
        if (!rol) throw httpError('Rol no encontrado', 400)
      }

      if (dto.delegacion_id !== undefined && dto.delegacion_id !== current.delegacion_id) {
        const delegacion = await tx.delegacion.findUnique({ where: { id: dto.delegacion_id } })
        if (!delegacion) throw httpError('Delegación no encontrada', 400)

        const miembro = await tx.miembroEquipo.findFirst({
          where: { usuario_id: usuarioId, Equipo: { delegacion_id: { not: dto.delegacion_id } } },
        })
        const asignacion = await tx.asignacionGuardia.findFirst({
          where: {
            usuario_id: usuarioId,
            Guardia: { delegacion_id: { not: dto.delegacion_id }, fecha_fin: { gt: new Date() } },
          },
        })
        if (miembro || asignacion) {
          throw httpError(
            'Retira al usuario de sus equipos y guardias vigentes o futuras antes de cambiar de delegación.',
            409,
          )
        }
      }

      return tx.usuario.update({
        where: { id: usuarioId },
        data: {
          ...changes,
          ...(hash
            ? {
                password_hash: hash,
                password_actualizada_en: new Date(
                  Math.max(Date.now(), (current.password_actualizada_en?.getTime() ?? 0) + 1),
                ),
                requiere_reset: true,
              }
            : {}),
        },
        select: usuarioSeguroSelect,
      })
    })

    res.json(usuario)
  } catch (e) {
    next(e)
  }
})

export default router
