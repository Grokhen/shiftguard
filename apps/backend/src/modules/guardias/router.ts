import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../../prisma'
import { authRequired } from '../../middlewares/authRequired'

const router = Router()
const iso = z.string().refine((v) => !Number.isNaN(Date.parse(v)), 'Fecha inválida')

const crearGuardiaSchema = z
  .object({
    delegacion_id: z.number().int().positive(),
    fecha_inicio: iso,
    fecha_fin: iso,
    estado: z.string().max(20).optional(),
  })
  .refine((d) => new Date(d.fecha_fin) > new Date(d.fecha_inicio), {
    path: ['fecha_fin'],
    message: 'fecha_fin > fecha_inicio',
  })

router.post('/', authRequired, async (req, res, next) => {
  try {
    const dto = crearGuardiaSchema.parse(req.body)
    const ini = new Date(dto.fecha_inicio)
    const fin = new Date(dto.fecha_fin)

    const overlap = await prisma.guardia.findFirst({
      where: {
        delegacion_id: dto.delegacion_id,
        AND: [{ fecha_inicio: { lt: fin } }, { fecha_fin: { gt: ini } }],
      },
    })
    if (overlap)
      return res.status(400).json({ error: 'Ya existe una guardia solapada en esta delegación' })

    const created = await prisma.guardia.create({
      data: {
        delegacion_id: dto.delegacion_id,
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

export default router
