import { randomUUID } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import argon2 from 'argon2'
import request from 'supertest'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { app } from '../src/app'
import { prisma } from '../src/prisma'
import { seedDatabase } from '../src/prisma/seed'
import { createReadBarrier } from './helpers'

type CatalogItem = { id: number; codigo: string }
type Account = { id: number; email: string; password: string }

const initialAdminPassword = randomUUID()
let adminToken: string
let roles: CatalogItem[]

function loginRequest(email: string, password: string) {
  return request(app).post('/api/auth/login').send({ email, password })
}

async function login(email: string, password: string): Promise<string> {
  const response = await loginRequest(email, password).expect(200)
  expect(Object.keys(response.body)).toEqual(['access_token'])
  expect(response.body.access_token).toEqual(expect.any(String))
  return response.body.access_token
}

function profile(token: string) {
  return request(app).get('/api/usuarios/me').set('Authorization', `Bearer ${token}`)
}

function changePassword(token: string, current: string, next: string) {
  return request(app)
    .patch('/api/usuarios/me/password')
    .set('Authorization', `Bearer ${token}`)
    .send({ password_actual: current, password_nueva: next })
}

function editAccount(id: number, changes: Record<string, unknown>) {
  return request(app)
    .patch(`/api/usuarios/${id}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send(changes)
}

function catalogId(items: CatalogItem[], code: string) {
  const item = items.find((candidate) => candidate.codigo === code)
  expect(item, `Missing catalog code: ${code}`).toBeDefined()
  return item!.id
}

async function createDelegation(): Promise<number> {
  const response = await request(app)
    .post('/api/delegaciones')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ nombre: `Auth flow ${randomUUID()}` })
    .expect(201)
  return response.body.id
}

async function registerAccount(delegation: number, role = 'TECNICO'): Promise<Account> {
  const email = `${randomUUID()}@example.invalid`
  const password = randomUUID()
  const response = await request(app)
    .post('/api/usuarios')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      nombre: 'Integration',
      apellidos: role,
      email,
      password,
      rol_id: catalogId(roles, role),
      delegacion_id: delegation,
      requiere_reset: false,
    })
    .expect(201)
  // Clients cannot opt out of the mandatory change when registering an account.
  expect(response.body).toMatchObject({ email, requiere_reset: true, activo: true })
  expect(response.body).not.toHaveProperty('password_hash')
  return { id: response.body.id, email, password }
}

async function activate(account: Account) {
  const restricted = await login(account.email, account.password)
  const me = await profile(restricted).expect(200)
  expect(me.body).toMatchObject({ id: account.id, requiere_reset: true })
  expect(me.body).not.toHaveProperty('password_hash')
  const blocked = await request(app)
    .get('/api/permisos/mios')
    .set('Authorization', `Bearer ${restricted}`)
    .expect(403)
  expect(blocked.body.code).toBe('PASSWORD_CHANGE_REQUIRED')
  const password = randomUUID()
  await changePassword(restricted, account.password, password).expect(204)
  await profile(restricted).expect(401)
  const token = await login(account.email, password)
  const active = await profile(token).expect(200)
  expect(active.body.requiere_reset).toBe(false)
  return { ...account, password, token }
}

beforeAll(async () => {
  // setupEnv.ts already verified the randomly isolated shiftguard_test schema.
  // Bootstrap only via the real seed; every session below comes from HTTP login.
  await seedDatabase(prisma, {
    AUTH_PEPPER: process.env.AUTH_PEPPER,
    SEED_ADMIN_PASSWORD: initialAdminPassword,
  })
  adminToken = await login('admin@empresa.local', initialAdminPassword)
  const response = await request(app)
    .get('/api/rolesUsuario')
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200)
  roles = response.body
})
beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => {}))
afterEach(() => vi.restoreAllMocks())
afterAll(() => prisma.$disconnect())

describe('authenticated API flows with real Argon2, JWT and PostgreSQL', () => {
  it('keeps the seeded administrator credentials and session when the seed runs again', async () => {
    const before = await prisma.usuario.findUniqueOrThrow({
      where: { email: 'admin@empresa.local' },
    })
    const replacement = randomUUID()
    await seedDatabase(prisma, {
      AUTH_PEPPER: process.env.AUTH_PEPPER,
      SEED_ADMIN_PASSWORD: replacement,
    })
    expect(await prisma.usuario.findUniqueOrThrow({ where: { id: before.id } })).toEqual(before)
    await profile(adminToken).expect(200)
    await loginRequest(before.email, replacement).expect(401)
    await login(before.email, initialAdminPassword)
  })

  it.each(['APROBADO', 'RECHAZADO'])(
    'completes onboarding, a permission request and its %s decision',
    async (decision) => {
      const delegation = await createDelegation()
      const registered = await registerAccount(delegation)
      const technician = await activate(registered)
      const supervisor = await activate(await registerAccount(delegation, 'SUPERVISOR'))
      await loginRequest(registered.email, registered.password).expect(401)
      const account = await prisma.usuario.findUniqueOrThrow({ where: { id: technician.id } })
      expect(account.password_actualizada_en).toBeInstanceOf(Date)
      expect(account.ultimo_login).toBeInstanceOf(Date)
      expect(
        await argon2.verify(account.password_hash!, technician.password + process.env.AUTH_PEPPER),
      ).toBe(true)
      expect(await argon2.verify(account.password_hash!, technician.password)).toBe(false)

      const types = await request(app)
        .get('/api/permisos/tipos')
        .set('Authorization', `Bearer ${technician.token}`)
        .expect(200)
      const states = await request(app)
        .get('/api/permisos/estados')
        .set('Authorization', `Bearer ${supervisor.token}`)
        .expect(200)
      const created = await request(app)
        .post('/api/permisos')
        .set('Authorization', `Bearer ${technician.token}`)
        .send({
          tipo_id: catalogId(types.body, 'VACACIONES'),
          fecha_inicio: '2027-01-01',
          fecha_fin: '2027-01-03',
          observaciones: 'API flow',
        })
        .expect(201)
      expect(created.body).toMatchObject({
        usuario_id: technician.id,
        creado_por: technician.id,
        Estado: { codigo: 'PENDIENTE' },
      })
      await request(app)
        .patch(`/api/permisos/${created.body.id}/decidir`)
        .set('Authorization', `Bearer ${technician.token}`)
        .send({ estado_id: catalogId(states.body, decision) })
        .expect(403)
      const inbox = await request(app)
        .get('/api/permisos/pendientes')
        .set('Authorization', `Bearer ${supervisor.token}`)
        .expect(200)
      expect(inbox.body.map((item: { id: number }) => item.id)).toEqual([created.body.id])
      expect(JSON.stringify(inbox.body)).not.toContain('password_hash')
      const decided = await request(app)
        .patch(`/api/permisos/${created.body.id}/decidir`)
        .set('Authorization', `Bearer ${supervisor.token}`)
        .send({
          estado_id: catalogId(states.body, decision),
          observaciones: `Decision ${decision}`,
        })
        .expect(200)
      expect(decided.body).toMatchObject({
        decidido_por: supervisor.id,
        Estado: { codigo: decision },
      })
      const mine = await request(app)
        .get('/api/permisos/mios')
        .query({ anio: 2027 })
        .set('Authorization', `Bearer ${technician.token}`)
        .expect(200)
      expect(mine.body).toEqual([decided.body])
      const stored = await prisma.permiso.findUniqueOrThrow({ where: { id: created.body.id } })
      expect(stored).toMatchObject({
        usuario_id: technician.id,
        creado_por: technician.id,
        decidido_por: supervisor.id,
        estado_id: catalogId(states.body, decision),
        observaciones: `Decision ${decision}`,
      })
      const empty = await request(app)
        .get('/api/permisos/pendientes')
        .set('Authorization', `Bearer ${supervisor.token}`)
        .expect(200)
      expect(empty.body).toEqual([])
    },
  )

  it('revokes existing sessions after an administrative password reset and completes recovery', async () => {
    const account = await activate(await registerAccount(await createDelegation()))
    const before = await prisma.usuario.findUniqueOrThrow({ where: { id: account.id } })
    const temporary = randomUUID()
    const reset = await editAccount(account.id, { password: temporary }).expect(200)
    expect(reset.body.requiere_reset).toBe(true)
    expect(reset.body).not.toHaveProperty('password_hash')
    await profile(account.token).expect(401)
    await loginRequest(account.email, account.password).expect(401)
    const restricted = await login(account.email, temporary)
    const blocked = await request(app)
      .get('/api/equipos')
      .set('Authorization', `Bearer ${restricted}`)
      .expect(403)
    expect(blocked.body.code).toBe('PASSWORD_CHANGE_REQUIRED')
    const resetState = await prisma.usuario.findUniqueOrThrow({ where: { id: account.id } })
    expect(resetState.password_actualizada_en!.getTime()).toBeGreaterThan(
      before.password_actualizada_en!.getTime(),
    )
    // Failed changes must preserve the temporary credentials and the reset requirement.
    await changePassword(restricted, randomUUID(), randomUUID()).expect(400)
    await changePassword(restricted, temporary, temporary).expect(400)
    expect(await prisma.usuario.findUniqueOrThrow({ where: { id: account.id } })).toEqual(
      resetState,
    )
    const password = randomUUID()
    await changePassword(restricted, temporary, password).expect(204)
    await profile(restricted).expect(401)
    await loginRequest(account.email, temporary).expect(401)
    const token = await login(account.email, password)
    expect((await profile(token).expect(200)).body.requiere_reset).toBe(false)
    expect(
      (
        await prisma.usuario.findUniqueOrThrow({ where: { id: account.id } })
      ).password_actualizada_en!.getTime(),
    ).toBeGreaterThan(resetState.password_actualizada_en!.getTime())
  })

  it('enforces a reset flag activated after login and retains only the recovery routes', async () => {
    const account = await activate(await registerAccount(await createDelegation(), 'ADMIN'))
    await request(app)
      .get('/api/usuarios')
      .set('Authorization', `Bearer ${account.token}`)
      .expect(200)
    await editAccount(account.id, { requiere_reset: true }).expect(200)
    const blocked = await request(app)
      .get('/api/usuarios')
      .set('Authorization', `Bearer ${account.token}`)
      .expect(403)
    expect(blocked.body.code).toBe('PASSWORD_CHANGE_REQUIRED')
    expect((await profile(account.token).expect(200)).body.requiere_reset).toBe(true)
    await request(app)
      .patch('/api/usuarios/me')
      .set('Authorization', `Bearer ${account.token}`)
      .send({ requiere_reset: false })
      .expect(403)
    const password = randomUUID()
    await changePassword(account.token, account.password, password).expect(204)
    await profile(account.token).expect(401)
    const fresh = await login(account.email, password)
    await request(app).get('/api/usuarios').set('Authorization', `Bearer ${fresh}`).expect(200)
  })

  it.each(['role', 'delegation', 'deactivation'] as const)(
    'applies a %s change to issued sessions and subsequent logins',
    async (change) => {
      const source = await createDelegation()
      const destination = await createDelegation()
      const account = await activate(await registerAccount(source, 'SUPERVISOR'))
      const before = await prisma.usuario.findUniqueOrThrow({ where: { id: account.id } })
      const teamIds: number[] = []
      if (change === 'delegation') {
        for (const delegacion_id of [source, destination]) {
          const team = await request(app)
            .post('/api/equipos')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ nombre_equipo: 'Session scope', delegacion_id })
            .expect(201)
          teamIds.push(team.body.id)
        }
        const original = await request(app)
          .get('/api/equipos')
          .set('Authorization', `Bearer ${account.token}`)
          .expect(200)
        expect(original.body.map((item: { id: number }) => item.id)).toEqual([teamIds[0]])
      }
      await request(app)
        .get('/api/permisos/pendientes')
        .set('Authorization', `Bearer ${account.token}`)
        .expect(200)
      const changes =
        change === 'role'
          ? { rol_id: catalogId(roles, 'TECNICO') }
          : change === 'delegation'
            ? { delegacion_id: destination }
            : { activo: false }
      await editAccount(account.id, changes).expect(200)
      await profile(account.token).expect(401)
      expect(await prisma.usuario.findUniqueOrThrow({ where: { id: account.id } })).toMatchObject({
        ...changes,
        password_hash: before.password_hash,
        password_actualizada_en: before.password_actualizada_en,
      })
      if (change === 'deactivation') {
        await loginRequest(account.email, account.password).expect(401)
      } else {
        const fresh = await login(account.email, account.password)
        const me = await profile(fresh).expect(200)
        expect(me.body).toMatchObject(changes)
        if (change === 'role') {
          await request(app)
            .get('/api/permisos/pendientes')
            .set('Authorization', `Bearer ${fresh}`)
            .expect(403)
        } else {
          const teams = await request(app)
            .get('/api/equipos')
            .set('Authorization', `Bearer ${fresh}`)
            .expect(200)
          expect(teams.body.map((item: { id: number }) => item.id)).toEqual([teamIds[1]])
        }
      }
    },
  )

  it('persists only one concurrent password change and accepts only the winning password at login', async () => {
    const account = await activate(await registerAccount(await createDelegation()))
    const otherSession = await login(account.email, account.password)
    const before = await prisma.usuario.findUniqueOrThrow({ where: { id: account.id } })
    const passwords = [randomUUID(), randomUUID()]
    const barrier = createReadBarrier()
    const original = prisma.usuario.findUnique.bind(prisma.usuario)
    const read = vi.spyOn(prisma.usuario, 'findUnique')
    // Both handlers read the real old hash before either verifies/hashes/writes.
    // The route awaits the query and never uses Prisma's fluent relation methods.
    read.mockImplementation((async (args: Prisma.UsuarioFindUniqueArgs) => {
      const result = await original(args)
      if (args.where.id === account.id && args.select?.password_hash) await barrier.wait()
      return result
    }) as unknown as typeof prisma.usuario.findUnique)
    let winner: number
    try {
      const responses = await Promise.all([
        changePassword(account.token, account.password, passwords[0]),
        changePassword(otherSession, account.password, passwords[1]),
      ])
      expect(responses.map((response) => response.status).sort()).toEqual([204, 409])
      expect(barrier.arrivals).toBe(2)
      winner = responses.findIndex((response) => response.status === 204)
      expect(responses[1 - winner].body).toEqual({
        error: 'La contraseña ha cambiado. Inicia sesión de nuevo.',
      })
    } finally {
      barrier.close()
      read.mockRestore()
    }
    await profile(account.token).expect(401)
    await profile(otherSession).expect(401)
    await loginRequest(account.email, account.password).expect(401)
    await loginRequest(account.email, passwords[1 - winner]).expect(401)
    const fresh = await login(account.email, passwords[winner])
    await profile(fresh).expect(200)
    const stored = await prisma.usuario.findUniqueOrThrow({ where: { id: account.id } })
    expect(stored.password_actualizada_en!.getTime()).toBeGreaterThan(
      before.password_actualizada_en!.getTime(),
    )
    expect(
      await argon2.verify(stored.password_hash!, passwords[winner] + process.env.AUTH_PEPPER),
    ).toBe(true)
    expect(stored.requiere_reset).toBe(false)
  })
})
