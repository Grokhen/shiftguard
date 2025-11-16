import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../../prisma'
import { authRequired } from '../../middlewares/authRequired'

const router = Router()
const iso = z.string().refine((v) => !Number.isNaN(Date.parse(v)), 'Fecha inválida')

const crearPermisoSchema = z
  .object({
    usuario_id: z.number().int().positive(),
    tipo_id: z.number().int().positive(),
    estado_id: z.number().int().positive(),
    fecha_inicio: iso,
    fecha_fin: iso,
    observaciones: z.string().max(500).optional(),
  })
  .refine((d) => new Date(d.fecha_fin) >= new Date(d.fecha_inicio), {
    path: ['fecha_fin'],
    message: 'fecha_fin >= fecha_inicio',
  })

router.post('/', authRequired, async (req, res, next) => {
  try {
    const dto = crearPermisoSchema.parse(req.body)
    const created = await prisma.permiso.create({
      data: {
        usuario_id: dto.usuario_id,
        tipo_id: dto.tipo_id,
        estado_id: dto.estado_id,
        fecha_inicio: new Date(dto.fecha_inicio),
        fecha_fin: new Date(dto.fecha_fin),
        observaciones: dto.observaciones,
      },
    })
    res.status(201).json(created)
  } catch (e) {
    next(e)
  }
})

export default router
