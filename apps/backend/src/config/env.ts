import 'dotenv/config'

const required = ['DATABASE_URL', 'JWT_SECRET', 'AUTH_PEPPER', 'PORT'] as const

for (const k of required) {
  if (!process.env[k]) throw new Error(`Falta variable de entorno: ${k}`)
}

export const ENV = {
  NODE_ENV: process.env.NODE_ENV ?? 'development',
  PORT: Number(process.env.PORT ?? 3001),
  JWT_SECRET: process.env.JWT_SECRET!,
  AUTH_PEPPER: process.env.AUTH_PEPPER!,
}
