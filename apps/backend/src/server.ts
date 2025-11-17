import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import { ENV } from './config/env'
import authRouter from './modules/auth/router'
import permisosRouter from './modules/permisos/router'
import guardiasRouter from './modules/guardias/router'
import equiposRouter from './modules/equipos/router'
import { errorHandler } from './middlewares/errorHandler'

const app = express()
app.use(helmet())
app.use(cors())
app.use(express.json())
app.use(morgan('dev'))

app.get('/health', (_req, res) => res.json({ ok: true }))

app.use('/api/auth', authRouter)
app.use('/api/permisos', permisosRouter)
app.use('/api/guardias', guardiasRouter)
app.use('/api/equipos', equiposRouter)

app.use(errorHandler)

app.listen(ENV.PORT, () => console.log(`API escuchando en http://localhost:${ENV.PORT}`))
