import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../../prisma'
import { authRequired } from '../../middlewares/authRequired'

const router = Router()

router.use(authRequired)

async function getUserRoleCodigo(roleId: number): Promise<string | null> {
  const rol = await prisma.rolUsuario.findUnique({ where: { id: roleId } })
  return rol?.codigo ?? null
}

async function ensureAdmin(roleId: number) {
  const codigo = await getUserRoleCodigo(roleId)
  if (codigo !== 'ADMIN') {
    const err = new Error('Acción reservada a administradores')
    ;(err as any).statusCode = 403
    throw err
  }
}

const editarRolSchema = z.object({
  codigo: z.string().max(30).optional(),
  nombre: z.string().max(80).optional(),
})

router.get('/', async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'No autenticado' })
    }

    await ensureAdmin(req.user.role)

    const roles = await prisma.rolUsuario.findMany({
      orderBy: { nombre: 'asc' },
    })

    res.json(roles)
  } catch (e) {
    next(e)
  }
})

router.patch('/:id', async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'No autenticado' })
    }

    await ensureAdmin(req.user.role)

    const rolId = Number(req.params.id)
    if (Number.isNaN(rolId)) {
      return res.status(400).json({ error: 'ID de rol inválido' })
    }

    const dto = editarRolSchema.parse(req.body)

    const rol = await prisma.rolUsuario.update({
      where: { id: rolId },
      data: dto,
    })

    res.json(rol)
  } catch (e) {
    next(e)
  }
})

export default router
