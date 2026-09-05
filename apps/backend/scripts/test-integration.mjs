import { randomUUID, randomBytes } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PrismaClient } from '@prisma/client'
import { integrationDatabaseUrl, quotedTestSchema } from '../integration/database.mjs'

const require = createRequire(import.meta.url)
const backendDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const schema = `shiftguard_it_${randomUUID().replaceAll('-', '')}`
let client
let schemaCreated = false

try {
  // Never fall back to DATABASE_URL or load a development .env for the target database.
  const databaseUrl = integrationDatabaseUrl(process.env.TEST_DATABASE_URL, schema)
  const env = {
    ...process.env,
    NODE_ENV: 'test',
    DATABASE_URL: databaseUrl,
    SHIFTGUARD_INTEGRATION_SCHEMA: schema,
    JWT_SECRET: randomBytes(32).toString('hex'),
    AUTH_PEPPER: randomBytes(32).toString('hex'),
  }
  client = new PrismaClient({ datasourceUrl: databaseUrl })
  await client.$executeRawUnsafe(`CREATE SCHEMA ${quotedTestSchema(schema)}`)
  schemaCreated = true
  console.log(`Esquema de pruebas: ${schema}`)

  const run = (entry, args) =>
    execFileSync(process.execPath, [entry, ...args], {
      cwd: backendDirectory,
      env,
      stdio: 'inherit',
    })
  run(require.resolve('prisma/build/index.js'), ['migrate', 'deploy'])
  run(resolve(dirname(require.resolve('vitest/package.json')), 'vitest.mjs'), [
    'run',
    '--config',
    'vitest.integration.config.mts',
  ])
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Falló la integración con PostgreSQL')
  process.exitCode = 1
} finally {
  if (client) {
    try {
      if (schemaCreated) {
        await client.$executeRawUnsafe(`DROP SCHEMA ${quotedTestSchema(schema)} CASCADE`)
        console.log(`Esquema de pruebas eliminado: ${schema}`)
      }
    } catch {
      console.error(`No se pudo limpiar el esquema de pruebas ${schema}`)
      process.exitCode = 1
    } finally {
      await client.$disconnect()
    }
  }
}
