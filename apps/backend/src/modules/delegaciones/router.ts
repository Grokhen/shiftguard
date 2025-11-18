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

const crearDelegacionSchema = z.object({
  nombre: z.string().min(1).max(120),
  codigo: z.string().max(20).optional(),
  pais_code: z.string().length(2).optional(),
  region_code: z.string().max(50).optional(),
  activo: z.boolean().optional(),
})

const editarDelegacionSchema = z.object({
  nombre: z.string().min(1).max(120).optional(),
  codigo: z.string().max(20).optional(),
  pais_code: z.string().length(2).optional(),
  region_code: z.string().max(50).optional(),
  activo: z.boolean().optional(),
})

// POST /api/delegaciones  (admin)
router.post('/', async (req, res, next) => {
  try {
    const user = req.user as AuthUser
    await ensureAdmin(user)

    const dto = crearDelegacionSchema.parse(req.body)

    const delegacion = await prisma.delegacion.create({
      data: {
        nombre: dto.nombre,
        codigo: dto.codigo ?? null,
        pais_code: dto.pais_code ?? null,
        region_code: dto.region_code ?? null,
        activo: dto.activo ?? true,
      },
    })

    res.status(201).json(delegacion)
  } catch (e) {
    next(e)
  }
})

// GET /api/delegaciones  (admin)
router.get('/', async (req, res, next) => {
  try {
    const user = req.user as AuthUser
    await ensureAdmin(user)

    const delegaciones = await prisma.delegacion.findMany({
      orderBy: { nombre: 'asc' },
    })

    res.json(delegaciones)
  } catch (e) {
    next(e)
  }
})

// PATCH /api/delegaciones/:id  (admin)
router.patch('/:id', async (req, res, next) => {
  try {
    const user = req.user as AuthUser
    await ensureAdmin(user)

    const delegacionId = Number(req.params.id)
    if (Number.isNaN(delegacionId)) {
      return res.status(400).json({ error: 'ID de delegación inválido' })
    }

    const dto = editarDelegacionSchema.parse(req.body)

    const delegacion = await prisma.delegacion.update({
      where: { id: delegacionId },
      data: dto,
    })

    res.json(delegacion)
  } catch (e) {
    next(e)
  }
})

export default router
