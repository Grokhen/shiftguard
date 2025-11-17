import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../../prisma'
import { authRequired } from '../../middlewares/authRequired'

const router = Router()

router.use(authRequired)

const iso = z.string().refine((v) => !Number.isNaN(Date.parse(v)), 'Fecha inválida')

const crearGuardiaSchema = z
  .object({
    fecha_inicio: iso,
    fecha_fin: iso,
    estado: z.string().max(20).optional(),
  })
  .refine((d) => new Date(d.fecha_fin) > new Date(d.fecha_inicio), {
    path: ['fecha_fin'],
    message: 'fecha_fin > fecha_inicio',
  })

const listarGuardiasQuerySchema = z.object({
  desde: iso.optional(),
  hasta: iso.optional(),
})

router.get('/', async (req, res, next) => {
  try {
    const user = req.user

    if (!user) {
      return res.status(401).json({ error: 'No autenticado' })
    }

    const query = listarGuardiasQuerySchema.parse(req.query)

    const where: any = { delegacion_id: user.deleg }

    if (query.desde || query.hasta) {
      where.fecha_inicio = {}
      if (query.desde) where.fecha_inicio.gte = new Date(query.desde)
      if (query.hasta) where.fecha_inicio.lte = new Date(query.hasta)
    }

    const guardias = await prisma.guardia.findMany({
      where,
      orderBy: { fecha_inicio: 'asc' },
    })

    res.json(guardias)
  } catch (e) {
    next(e)
  }
})

router.post('/', authRequired, async (req, res, next) => {
  try {
    const user = req.user
    if (!user) {
      return res.status(401).json({ error: 'No autenticado' })
    }
    const dto = crearGuardiaSchema.parse(req.body)
    const ini = new Date(dto.fecha_inicio)
    const fin = new Date(dto.fecha_fin)

    const overlap = await prisma.guardia.findFirst({
      where: {
        delegacion_id: user.deleg,
        AND: [{ fecha_inicio: { lt: fin } }, { fecha_fin: { gt: ini } }],
      },
    })
    if (overlap)
      return res.status(400).json({ error: 'Ya existe una guardia solapada en esta delegación' })

    const created = await prisma.guardia.create({
      data: {
        delegacion_id: user.deleg,
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
