import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../../prisma'
import { authRequired } from '../../middlewares/authRequired'
import { ensureAdmin, type AuthUser } from '../../utils/authz'

const router = Router()

router.use(authRequired)

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
