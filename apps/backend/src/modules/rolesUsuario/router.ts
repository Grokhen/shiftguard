import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../../prisma'
import { authRequired } from '../../middlewares/authRequired'
import { ensureAdmin } from '../../utils/authz'

const router = Router()

router.use(authRequired)

const editarRolSchema = z.object({
  codigo: z.string().max(30).optional(),
  nombre: z.string().max(80).optional(),
})

router.get('/', async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'No autenticado' })
    }

    await ensureAdmin(req.user)

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

    await ensureAdmin(req.user)

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
