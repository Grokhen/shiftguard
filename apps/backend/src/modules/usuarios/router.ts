import { Router } from 'express'
import { z } from 'zod'
import argon2 from 'argon2'
import { prisma } from '../../prisma'
import { authRequired } from '../../middlewares/authRequired'
import { ENV } from '../../config/env'

const router = Router()

router.use(authRequired)

type AuthUser = {
  sub: number
  role: number
  deleg: number
}

async function getUserRoleCodigo(user: AuthUser): Promise<string | null> {
  const rol = await prisma.rolUsuario.findUnique({ where: { id: user.role } })
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
  requiere_reset: z.boolean().optional(),
  password: z.string().min(8).optional(),
})

const editarPerfilPropioSchema = z.object({
  nombre: z.string().min(1).max(100).optional(),
  apellidos: z.string().min(1).max(150).optional(),
})

const cambiarPasswordSchema = z.object({
  password_actual: z.string().min(8),
  password_nueva: z.string().min(8),
})

// POST /api/usuarios  (admin)
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
    })

    res.status(201).json(usuario)
  } catch (e) {
    next(e)
  }
})

// PATCH /api/usuarios/:id  (admin)
router.patch('/:id', async (req, res, next) => {
  try {
    const authUser = req.user as AuthUser
    await ensureAdmin(authUser)

    const usuarioId = Number(req.params.id)
    if (Number.isNaN(usuarioId)) {
      return res.status(400).json({ error: 'ID de usuario inválido' })
    }

    const dto = editarUsuarioSchema.parse(req.body)

    const data: any = { ...dto }

    if (dto.password) {
      data.password_hash = await argon2.hash(dto.password + ENV.AUTH_PEPPER)
      data.requiere_reset = false
      delete data.password
    }

    const usuario = await prisma.usuario.update({
      where: { id: usuarioId },
      data,
    })

    res.json(usuario)
  } catch (e) {
    next(e)
  }
})

/**
  GET /api/usuarios/me
  Devuelve el perfil del usuario autenticado
 */
router.get('/me', async (req, res, next) => {
  try {
    const authUser = req.user as AuthUser

    const usuario = await prisma.usuario.findUnique({
      where: { id: authUser.sub },
      select: {
        id: true,
        nombre: true,
        apellidos: true,
        email: true,
        delegacion_id: true,
        rol_id: true,
        activo: true,
        fecha_creacion: true,
        fecha_actualizacion: true,
        ultimo_login: true,
      },
    })

    if (!usuario) {
      return res.status(404).json({ error: 'Usuario no encontrado' })
    }

    res.json(usuario)
  } catch (e) {
    next(e)
  }
})

/**
  PATCH /api/usuarios/me
  Permite al usuario editar su propio perfil (solo campos seguros)
 */
router.patch('/me', async (req, res, next) => {
  try {
    const authUser = req.user as AuthUser

    const dto = editarPerfilPropioSchema.parse(req.body)

    const usuario = await prisma.usuario.update({
      where: { id: authUser.sub },
      data: dto,
      select: {
        id: true,
        nombre: true,
        apellidos: true,
        email: true,
        delegacion_id: true,
        rol_id: true,
        activo: true,
        fecha_creacion: true,
        fecha_actualizacion: true,
      },
    })

    res.json(usuario)
  } catch (e) {
    next(e)
  }
})

/**
  PATCH /api/usuarios/me/password
  Cambiar la contraseña propia:
  - Requiere contraseña actual
  - Aplica pepper + argon2
 */
router.patch('/me/password', async (req, res, next) => {
  try {
    const authUser = req.user as AuthUser

    const dto = cambiarPasswordSchema.parse(req.body)

    const usuario = await prisma.usuario.findUnique({
      where: { id: authUser.sub },
      select: {
        id: true,
        password_hash: true,
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

    await prisma.usuario.update({
      where: { id: authUser.sub },
      data: {
        password_hash: nuevoHash,
        password_actualizada_en: new Date(),
        requiere_reset: false,
      },
    })

    res.status(204).send()
  } catch (e) {
    next(e)
  }
})

export default router
