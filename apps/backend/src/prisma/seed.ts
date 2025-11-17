import { PrismaClient } from '@prisma/client'
import argon2 from 'argon2'

const prisma = new PrismaClient()

async function upserts() {
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

async function main() {
  await upserts()

  const deleg = await prisma.delegacion.upsert({
    where: { nombre: 'Bilbao' },
    update: {},
    create: {
      nombre: 'Bilbao',
      codigo: 'BILBAO',
      pais_code: 'ES',
      region_code: 'Euskadi',
    },
  })

  if (!process.env.AUTH_PEPPER) {
    throw new Error('AUTH_PEPPER no está definido en el .env (requerido para el seed del admin).')
  }

  const rolAdmin = await prisma.rolUsuario.findUnique({
    where: { codigo: 'ADMIN' },
  })

  if (!rolAdmin) {
    throw new Error('No se encontró el rol ADMIN después del upsert.')
  }

  const pepper = process.env.AUTH_PEPPER
  const plainPassword = process.env.SEED_ADMIN_PASSWORD || 'Admin1234!'

  const hash = await argon2.hash(plainPassword + pepper, {
    type: argon2.argon2id,
    memoryCost: 2 ** 16,
    timeCost: 3,
  })

  const admin = await prisma.usuario.upsert({
    where: { email: 'admin@empresa.local' },
    update: {},
    create: {
      nombre: 'Admin',
      apellidos: 'Sistema',
      email: 'admin@empresa.local',
      password_hash: hash,
      rol_id: rolAdmin.id,
      delegacion_id: deleg.id,
    },
  })

  console.log('Seed completado.')
  console.log('Usuario admin listo para login:')
  console.log(`email: ${admin.email}`)
  console.log(`password: ${plainPassword}`)
}

main()
  .catch((e) => {
    console.error('Error durante el seed:')
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
