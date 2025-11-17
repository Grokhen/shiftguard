import { Router } from 'express'
import { prisma } from '../../prisma'
import * as argon2 from 'argon2'
import * as jwt from 'jsonwebtoken'
import { z } from 'zod'
import { ENV } from '../../config/env'

const router = Router()

const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(8),
})

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = loginSchema.parse(req.body)
    const user = await prisma.usuario.findUnique({ where: { email } })
    if (!user || !user.password_hash)
      return res.status(401).json({ error: 'Credenciales inválidas' })

    const ok = await argon2.verify(user.password_hash, password + ENV.AUTH_PEPPER)
    if (!ok) return res.status(401).json({ error: 'Credenciales inválidas' })

    await prisma.usuario.update({ where: { id: user.id }, data: { ultimo_login: new Date() } })
    const token = jwt.sign(
      { sub: user.id, role: user.rol_id, deleg: user.delegacion_id },
      ENV.JWT_SECRET,
      { expiresIn: '15m' },
    )
    res.json({ access_token: token })
  } catch (e) {
    next(e)
  }
})

export default router
