import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import { ENV } from './config/env'
import authRouter from './modules/auth/router'
import permisosRouter from './modules/permisos/router'
import guardiasRouter from './modules/guardias/router'
import equiposRouter from './modules/equipos/router'
import usuariosRouter from './modules/usuarios/router'
import delegacionesRouter from './modules/delegaciones/router'
import rolesUsuarioRouter from './modules/rolesUsuario/router'
import { errorHandler } from './middlewares/errorHandler'

export const app = express()

app.use(helmet())
app.use(cors(ENV.CORS_ORIGIN ? { origin: ENV.CORS_ORIGIN } : undefined))
app.use(express.json())

if (ENV.NODE_ENV !== 'test') {
  app.use(morgan('dev'))
}

app.get('/health', (_req, res) => res.json({ ok: true }))

app.use('/api/auth', authRouter)
app.use('/api/permisos', permisosRouter)
app.use('/api/guardias', guardiasRouter)
app.use('/api/equipos', equiposRouter)
app.use('/api/usuarios', usuariosRouter)
app.use('/api/delegaciones', delegacionesRouter)
app.use('/api/rolesUsuario', rolesUsuarioRouter)
app.use(errorHandler)

export default app
