import 'dotenv/config'
import { Prisma, PrismaClient } from '@prisma/client'
import argon2 from 'argon2'

class SeedConfigurationError extends Error {}

async function upserts(prisma: Prisma.TransactionClient) {
  const roles = [
    { codigo: 'TECNICO', nombre: 'Técnico' },
    { codigo: 'SUPERVISOR', nombre: 'Supervisor' },
    { codigo: 'ADMIN', nombre: 'Administrador' },
  ]

  const tipos = [
    { codigo: 'VACACIONES', nombre: 'Vacaciones' },
    { codigo: 'BAJA_MEDICA', nombre: 'Baja médica' },
    { codigo: 'ASUNTOS', nombre: 'Asuntos propios' },
    { codigo: 'FORMACION', nombre: 'Formación' },
    { codigo: 'OTRO', nombre: 'Otro' },
  ]

  const estados = [
    { codigo: 'PENDIENTE', nombre: 'Pendiente' },
    { codigo: 'APROBADO', nombre: 'Aprobado' },
    { codigo: 'RECHAZADO', nombre: 'Rechazado' },
    { codigo: 'CANCELADO', nombre: 'Cancelado' },
  ]

  const rolesGuardia = [
    { codigo: 'PRINCIPAL', nombre: 'Principal' },
    { codigo: 'SECUNDARIO', nombre: 'Secundario' },
  ]

  for (const r of roles) {
    await prisma.rolUsuario.upsert({
      where: { codigo: r.codigo },
      update: r,
      create: r,
    })
  }

  for (const t of tipos) {
    await prisma.tipoPermiso.upsert({
      where: { codigo: t.codigo },
      update: t,
      create: t,
    })
  }

  for (const e of estados) {
    await prisma.estadoPermiso.upsert({
      where: { codigo: e.codigo },
      update: e,
      create: e,
    })
  }

  for (const rg of rolesGuardia) {
    await prisma.rolGuardia.upsert({
      where: { codigo: rg.codigo },
      update: rg,
      create: rg,
    })
  }
}

export async function seedDatabase(prisma: PrismaClient, env: NodeJS.ProcessEnv = process.env) {
  // Validate before hashing or writing any catalog data. Never supply a default password.
  if (!env.AUTH_PEPPER) {
    throw new SeedConfigurationError('AUTH_PEPPER es obligatorio para ejecutar el seed.')
  }
  if (!env.SEED_ADMIN_PASSWORD || env.SEED_ADMIN_PASSWORD.length < 12 || env.SEED_ADMIN_PASSWORD.length > 128) {
    throw new SeedConfigurationError('SEED_ADMIN_PASSWORD es obligatoria y debe tener entre 12 y 128 caracteres.')
  }

  const hash = await argon2.hash(env.SEED_ADMIN_PASSWORD + env.AUTH_PEPPER, {
    type: argon2.argon2id,
    memoryCost: 2 ** 16,
    timeCost: 3,
  })

  return prisma.$transaction(async (tx) => {
    await upserts(tx)
    const deleg = await tx.delegacion.upsert({
      where: { nombre: 'Bilbao' },
      update: {},
      create: {
        nombre: 'Bilbao',
        codigo: 'BILBAO',
        pais_code: 'ES',
        region_code: 'Euskadi',
      },
    })
    const rolAdmin = await tx.rolUsuario.findUnique({ where: { codigo: 'ADMIN' } })
    if (!rolAdmin) throw new Error('No se encontró el rol ADMIN después del upsert.')

    return tx.usuario.upsert({
      where: { email: 'admin@empresa.local' },
      update: {}, // Re-running the seed must never reset an existing account.
      create: {
        nombre: 'Admin',
        apellidos: 'Sistema',
        email: 'admin@empresa.local',
        password_hash: hash,
        password_actualizada_en: new Date(),
        rol_id: rolAdmin.id,
        delegacion_id: deleg.id,
      },
      select: { email: true },
    })
  })
}

if (require.main === module) {
  const prisma = new PrismaClient()
  seedDatabase(prisma)
    .then((admin) => {
      console.log(`Seed completado. Cuenta inicial: ${admin.email}.`)
      console.log('Si la cuenta ya existía, se han conservado sus credenciales.')
    })
    .catch((error: unknown) => {
      // Prisma errors can contain query arguments. Do not print credentials or hashes.
      console.error(error instanceof SeedConfigurationError ? error.message : 'Error durante el seed. Revisa la conexión y el esquema de la base de datos.')
      process.exitCode = 1
    })
    .finally(async () => {
      await prisma.$disconnect()
    })
}
