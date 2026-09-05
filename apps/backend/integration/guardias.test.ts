import { randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import * as jwt from 'jsonwebtoken'
import request from 'supertest'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { app } from '../src/app'
import { prisma } from '../src/prisma'

beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => {}))
afterEach(() => vi.restoreAllMocks())
afterAll(() => prisma.$disconnect())

async function fixture() {
  const tag = randomUUID()
  const delegation = await prisma.delegacion.create({ data: { nombre: `Integration ${tag}` } })
  const role = await prisma.rolUsuario.upsert({
    where: { codigo: 'SUPERVISOR' },
    create: { codigo: 'SUPERVISOR', nombre: 'Supervisor' },
    update: {},
  })
  const user = await prisma.usuario.create({
    data: {
      nombre: 'Integration',
      apellidos: 'Supervisor',
      email: `${tag}@example.invalid`,
      rol_id: role.id,
      delegacion_id: delegation.id,
    },
  })
  const shiftRole = await prisma.rolGuardia.create({
    data: { codigo: tag.slice(0, 20), nombre: 'Integration role' },
  })
  const token = jwt.sign(
    {
      sub: user.id,
      role: role.id,
      roleCode: role.codigo,
      deleg: delegation.id,
      passwordVersion: 0,
    },
    process.env.JWT_SECRET!,
    { expiresIn: '15m' },
  )
  const assignments = [{ usuario_id: user.id, rol_guardia_id: shiftRole.id }]
  return { delegation, user, shiftRole, token, assignments }
}

type Fixture = Awaited<ReturnType<typeof fixture>>

async function createShift(data: Fixture, start: string, end: string) {
  return request(app)
    .post('/api/guardias')
    .set('Authorization', `Bearer ${data.token}`)
    .send({ fecha_inicio: start, fecha_fin: end, asignaciones: data.assignments })
    .expect(201)
}

// Pause after each of the first two overlap SELECTs. Both queries and all transactions
// still execute on PostgreSQL; only their scheduling is controlled by this barrier.
function synchronizeOverlapReads() {
  let arrivals = 0
  let release!: () => void
  let timeout: ReturnType<typeof setTimeout>
  const barrier = new Promise<void>((resolve, reject) => {
    release = resolve
    timeout = setTimeout(() => reject(new Error('No llegaron dos consultas concurrentes')), 3000)
  })
  const original = prisma.$transaction.bind(prisma)
  const spy = vi.spyOn(prisma, '$transaction')
  spy.mockImplementation(((
    work: (tx: Prisma.TransactionClient) => Promise<unknown>,
    options?: {
      isolationLevel?: Prisma.TransactionIsolationLevel
      maxWait?: number
      timeout?: number
    },
  ) =>
    original(async (tx) => {
      const guardia = new Proxy(tx.guardia, {
        get(target, key, receiver) {
          if (key !== 'findFirst') return Reflect.get(target, key, receiver)
          return async (args: Prisma.GuardiaFindFirstArgs) => {
            const result = await target.findFirst(args)
            if (arrivals < 2) {
              arrivals += 1
              if (arrivals === 2) {
                clearTimeout(timeout)
                release()
              }
              await barrier
            }
            return result
          }
        },
      })
      return work(
        new Proxy(tx, {
          get(target, key, receiver) {
            return key === 'guardia' ? guardia : Reflect.get(target, key, receiver)
          },
        }),
      )
    }, options)) as typeof prisma.$transaction)
  return {
    spy,
    close() {
      clearTimeout(timeout)
      release()
      spy.mockRestore()
    },
  }
}

async function rejectAssignmentsForRole(roleId: number) {
  if (!Number.isSafeInteger(roleId) || roleId <= 0) throw new Error('Invalid test role')
  // A test-only constraint causes a real database error after the route's prior writes.
  // Each test uses a fresh role, so pre-existing fixture assignments satisfy this check.
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "Asignaciones_Guardia" ADD CONSTRAINT "integration_reject_assignment" CHECK ("rol_guardia_id" <> ${roleId})`,
  )
}

async function removeAssignmentRejection() {
  await prisma.$executeRawUnsafe(
    'ALTER TABLE "Asignaciones_Guardia" DROP CONSTRAINT "integration_reject_assignment"',
  )
}

describe('guardia persistence and real PostgreSQL transactions', () => {
  it('stores explicit instants and allows adjacent shifts with atomic assignments', async () => {
    const data = await fixture()
    const first = await createShift(data, '2026-09-05T10:00:00+02:00', '2026-09-05T22:00:00+02:00')
    await createShift(data, '2026-09-05T20:00:00Z', '2026-09-06T08:00:00Z')
    const shifts = await prisma.guardia.findMany({
      where: { delegacion_id: data.delegation.id },
      include: { Asignaciones: true },
      orderBy: { fecha_inicio: 'asc' },
    })
    expect(shifts).toHaveLength(2)
    expect(shifts[0].fecha_inicio.toISOString()).toBe('2026-09-05T08:00:00.000Z')
    expect(shifts[0].fecha_fin).toEqual(shifts[1].fecha_inicio)
    expect(shifts.every((shift) => shift.Asignaciones.length === 1)).toBe(true)
    expect(first.body.Asignaciones[0].Usuario).not.toHaveProperty('password_hash')
  })

  it('rolls back the created guardia if inserting its assignments fails in PostgreSQL', async () => {
    const data = await fixture()
    await rejectAssignmentsForRole(data.shiftRole.id)
    try {
      const response = await request(app)
        .post('/api/guardias')
        .set('Authorization', `Bearer ${data.token}`)
        .send({
          fecha_inicio: '2026-09-05T08:00:00Z',
          fecha_fin: '2026-09-05T20:00:00Z',
          asignaciones: data.assignments,
        })
        .expect(500)
      expect(response.body).toEqual({ error: 'Error interno del servidor' })
      expect(await prisma.guardia.count({ where: { delegacion_id: data.delegation.id } })).toBe(0)
      expect(await prisma.asignacionGuardia.count({ where: { usuario_id: data.user.id } })).toBe(0)
    } finally {
      await removeAssignmentRejection()
    }
  })

  it('restores the dates and old assignments when a replacement fails after deletion', async () => {
    const data = await fixture()
    const created = await createShift(data, '2026-09-05T08:00:00Z', '2026-09-05T20:00:00Z')
    const before = await prisma.guardia.findUniqueOrThrow({
      where: { id: created.body.id },
      include: { Asignaciones: true },
    })
    const rejectedRole = await prisma.rolGuardia.create({
      data: { codigo: randomUUID().slice(0, 20), nombre: 'Rejected replacement' },
    })
    await rejectAssignmentsForRole(rejectedRole.id)
    try {
      await request(app)
        .patch(`/api/guardias/${before.id}`)
        .set('Authorization', `Bearer ${data.token}`)
        .send({
          fecha_fin: '2026-09-05T21:00:00Z',
          estado: 'EDITADA',
          asignaciones: [{ usuario_id: data.user.id, rol_guardia_id: rejectedRole.id }],
        })
        .expect(500)
      const after = await prisma.guardia.findUniqueOrThrow({
        where: { id: before.id },
        include: { Asignaciones: true },
      })
      expect(after).toEqual(before)
    } finally {
      await removeAssignmentRejection()
    }
  })

  it('retries a real serialization conflict and accepts only one overlapping creation', async () => {
    const data = await fixture()
    const race = synchronizeOverlapReads()
    try {
      const send = () =>
        request(app).post('/api/guardias').set('Authorization', `Bearer ${data.token}`).send({
          fecha_inicio: '2026-09-05T08:00:00Z',
          fecha_fin: '2026-09-05T20:00:00Z',
          asignaciones: data.assignments,
        })
      const responses = await Promise.all([send(), send()])
      expect(responses.map((response) => response.status).sort()).toEqual([201, 400])
      expect(responses.find((response) => response.status === 400)!.body.error).toMatch(/solapada/)
      expect(race.spy).toHaveBeenCalledTimes(3)
      expect(await prisma.guardia.count({ where: { delegacion_id: data.delegation.id } })).toBe(1)
      expect(await prisma.asignacionGuardia.count({ where: { usuario_id: data.user.id } })).toBe(1)
    } finally {
      race.close()
    }
  })

  it('prevents two concurrent edits from moving different guardias into the same interval', async () => {
    const data = await fixture()
    const first = await createShift(data, '2026-09-05T08:00:00Z', '2026-09-05T20:00:00Z')
    const second = await createShift(data, '2026-09-06T08:00:00Z', '2026-09-06T20:00:00Z')
    const race = synchronizeOverlapReads()
    try {
      const responses = await Promise.all(
        [first.body.id, second.body.id].map((id) =>
          request(app)
            .patch(`/api/guardias/${id}`)
            .set('Authorization', `Bearer ${data.token}`)
            .send({ fecha_inicio: '2026-09-07T08:00:00Z', fecha_fin: '2026-09-07T20:00:00Z' }),
        ),
      )
      expect(responses.map((response) => response.status).sort()).toEqual([200, 400])
      expect(race.spy).toHaveBeenCalledTimes(3)
      const shifts = await prisma.guardia.findMany({ where: { delegacion_id: data.delegation.id } })
      expect(shifts).toHaveLength(2)
      expect(
        shifts.filter((shift) => shift.fecha_inicio.toISOString().startsWith('2026-09-07')),
      ).toHaveLength(1)
      const loserIndex = responses.findIndex((response) => response.status === 400)
      const loserId = [first.body.id, second.body.id][loserIndex]
      expect(shifts.find((shift) => shift.id === loserId)!.fecha_inicio.toISOString()).toBe(
        ['2026-09-05T08:00:00.000Z', '2026-09-06T08:00:00.000Z'][loserIndex],
      )
      expect(await prisma.asignacionGuardia.count({ where: { usuario_id: data.user.id } })).toBe(2)
    } finally {
      race.close()
    }
  })
})

describe('guardia range SQL and authorization', () => {
  it.each(['general', 'mias', 'delegacion'])(
    'returns only intersecting authorized guardias from the %s list',
    async (list) => {
      const data = await fixture()
      await createShift(data, '2026-09-04T08:00:00Z', '2026-09-05T08:00:00Z')
      const ongoing = await createShift(data, '2026-09-05T08:00:00Z', '2026-09-05T20:00:00Z')
      await createShift(data, '2026-09-05T20:00:00Z', '2026-09-06T08:00:00Z')
      const other = await fixture()
      await createShift(other, '2026-09-05T08:00:00Z', '2026-09-05T20:00:00Z')
      const path =
        list === 'general' ? '' : list === 'mias' ? '/mias' : `/delegacion/${data.delegation.id}`
      const response = await request(app)
        .get(`/api/guardias${path}`)
        .query({ desde: '2026-09-05T10:00:00+02:00', hasta: '2026-09-05T22:00:00+02:00' })
        .set('Authorization', `Bearer ${data.token}`)
        .expect(200)
      expect(response.body).toHaveLength(1)
      expect(list === 'mias' ? response.body[0].guardia_id : response.body[0].id).toBe(
        ongoing.body.id,
      )

      const inside = await request(app)
        .get(`/api/guardias${path}`)
        .query({ desde: '2026-09-05T12:00:00Z', hasta: '2026-09-05T13:00:00Z' })
        .set('Authorization', `Bearer ${data.token}`)
        .expect(200)
      expect(inside.body).toHaveLength(1)
      expect(list === 'mias' ? inside.body[0].guardia_id : inside.body[0].id).toBe(ongoing.body.id)
    },
  )
})
