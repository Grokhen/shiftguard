import type { Prisma } from '@prisma/client'
import request from 'supertest'
import { afterAll, afterEach, expect, it, vi } from 'vitest'
import { app } from '../src/app'
import { prisma } from '../src/prisma'
import { createActor, createDelegation, createReadBarrier } from './helpers'

afterEach(() => vi.restoreAllMocks())
afterAll(() => prisma.$disconnect())

it('serializes two year preparations, keeps assignments, and shares cross-year weeks', async () => {
  const delegation = await createDelegation()
  const supervisor = await createActor(delegation.id, 'SUPERVISOR')
  const barrier = createReadBarrier()
  const original = prisma.$transaction.bind(prisma)
  vi.spyOn(prisma, '$transaction').mockImplementation(((work: (tx: Prisma.TransactionClient) => Promise<unknown>, options: object) =>
    original(async tx => work(new Proxy(tx, {
      get(target, key, receiver) {
        if (key !== 'guardia') return Reflect.get(target, key, receiver)
        return new Proxy(target.guardia, {
          get(delegate, method, queryReceiver) {
            if (method !== 'findMany') return Reflect.get(delegate, method, queryReceiver)
            return async (args: Prisma.GuardiaFindManyArgs) => {
              const rows = await delegate.findMany(args)
              await barrier.wait()
              return rows
            }
          },
        })
      },
    })), options)) as typeof prisma.$transaction)
  const generate = (anio: number) => request(app).post('/api/guardias/calendario')
    .set('Authorization', `Bearer ${supervisor.token}`).send({ anio })
  try {
    const responses = await Promise.all([generate(2026), generate(2026)])
    expect(responses.map(r => r.status)).toEqual([200, 200])
    expect(responses.map(r => r.body.creadas).sort()).toEqual([0, 53])
    expect(barrier.arrivals).toBe(2)
    expect(vi.mocked(prisma.$transaction).mock.calls.length).toBeGreaterThanOrEqual(3)
    expect(vi.mocked(prisma.$transaction).mock.calls.length).toBeLessThanOrEqual(6)
  } finally { barrier.close(); vi.restoreAllMocks() }
  const shifts = await prisma.guardia.findMany({ where: { delegacion_id: delegation.id }, orderBy: { fecha_inicio: 'asc' } })
  expect(shifts).toHaveLength(53)
  expect(await prisma.asignacionGuardia.count({ where: { guardia_id: { in: shifts.map(s => s.id) } } })).toBe(0)
  const technician = await createActor(delegation.id)
  const role = await prisma.rolGuardia.upsert({ where: { codigo: 'PRINCIPAL' }, create: { codigo: 'PRINCIPAL', nombre: 'Principal' }, update: {} })
  const assignment = await prisma.asignacionGuardia.create({ data: { guardia_id: shifts.at(-1)!.id, usuario_id: technician.user.id, rol_guardia_id: role.id } })
  await generate(2027).expect(200)
  await generate(2026).expect(200)
  expect(await prisma.asignacionGuardia.findUniqueOrThrow({ where: { id: assignment.id } })).toEqual(assignment)
  const calendar = await request(app).get('/api/guardias/calendario?anio=2027')
    .set('Authorization', `Bearer ${technician.token}`).expect(200)
  expect(calendar.body[0].id).toBe(shifts.at(-1)!.id)
  expect(JSON.stringify(calendar.body)).not.toContain('password_hash')
  const other = await createActor((await createDelegation()).id)
  const outside = await request(app).get('/api/guardias/calendario?anio=2026')
    .set('Authorization', `Bearer ${other.token}`).expect(200)
  expect(outside.body).toEqual([])
  await request(app).patch(`/api/guardias/${shifts[0].id}`)
    .set('Authorization', `Bearer ${technician.token}`).send({ asignaciones: [] }).expect(403)
})
