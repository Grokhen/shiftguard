import type { Prisma } from '@prisma/client'
import request from 'supertest'
import { afterAll, afterEach, beforeEach, expect, it, vi } from 'vitest'
import { app } from '../src/app'
import { prisma } from '../src/prisma'
import { calendarWeeks, currentShiftYear } from '../src/utils/shiftCalendar'
import { createActor, createDelegation, createReadBarrier } from './helpers'

beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => {}))
afterEach(() => vi.restoreAllMocks())
afterAll(() => prisma.$disconnect())

async function fixture() {
  const year = currentShiftYear()
  const delegation = await createDelegation()
  const supervisor = await createActor(delegation.id, 'SUPERVISOR')
  const primary = await createActor(delegation.id)
  const secondary = await createActor(delegation.id)
  const other = await createActor(delegation.id)
  const role = await prisma.rolGuardia.upsert({ where: { codigo: 'PRINCIPAL' }, create: { codigo: 'PRINCIPAL', nombre: 'Principal' }, update: {} })
  await prisma.rolGuardia.upsert({ where: { codigo: 'SECUNDARIO' }, create: { codigo: 'SECUNDARIO', nombre: 'Secundario' }, update: {} })
  await request(app).post('/api/guardias/calendario').set('Authorization', `Bearer ${supervisor.token}`).send({ anio: year }).expect(200)
  const shifts = await prisma.guardia.findMany({ where: { delegacion_id: delegation.id }, orderBy: { fecha_inicio: 'asc' } })
  const input = { anio: year, guardia_id: shifts[0].id, principal_id: primary.user.id, secundario_id: secondary.user.id, frecuencia_semanas: 3 }
  const plan = (body: object = input) => request(app).post('/api/guardias/calendario/planificar')
    .set('Authorization', `Bearer ${supervisor.token}`).send(body)
  const assignments = () => prisma.asignacionGuardia.findMany({ where: { Guardia: { delegacion_id: delegation.id } }, orderBy: { id: 'asc' } })
  return { year, delegation, supervisor, primary, secondary, other, role, shifts, input, plan, assignments }
}

it('persists a cyclic pair every three natural weeks and leaves all intervening weeks empty', async () => {
  const data = await fixture()
  const result = await data.plan().expect(200)
  const targets = data.shifts.filter((_, i) => i % 3 === 0)
  expect(result.body.programadas).toBe(targets.length)
  const rows = await data.assignments()
  expect(rows).toHaveLength(targets.length * 2)
  expect([...new Set(rows.map(a => a.guardia_id))]).toEqual(targets.map(s => s.id))
  const again = await data.plan().expect(200)
  expect(again.body.actualizadas).toBe(0)
  expect(await data.assignments()).toEqual(rows)
  await data.plan({ ...data.input, anio: data.year + 1 }).expect(400)
  expect(await data.assignments()).toEqual(rows)
})

it('includes the complete last week but never plans the following January weeks', async () => {
  const data = await fixture()
  await request(app).post('/api/guardias/calendario').set('Authorization', `Bearer ${data.supervisor.token}`)
    .send({ anio: data.year + 1 }).expect(200)
  await data.plan({ ...data.input, guardia_id: data.shifts.at(-1)!.id, frecuencia_semanas: 1 }).expect(200)
  const rows = await data.assignments()
  expect(rows).toHaveLength(2)
  expect(rows.every(a => a.guardia_id === data.shifts.at(-1)!.id)).toBe(true)
  const future = await prisma.guardia.findMany({ where: { delegacion_id: data.delegation.id, fecha_inicio: { gte: calendarWeeks(data.year).at(-1)!.fecha_fin } }, include: { Asignaciones: true } })
  expect(future.length).toBeGreaterThan(0)
  expect(future.every(s => s.Asignaciones.length === 0)).toBe(true)
})

it('rolls back replacement of the whole series when a later assignment fails in PostgreSQL', async () => {
  const data = await fixture()
  const original = await prisma.asignacionGuardia.create({ data: { guardia_id: data.shifts[0].id, usuario_id: data.other.user.id, rol_guardia_id: data.role.id } })
  await data.plan().expect(409)
  expect(await data.assignments()).toEqual([original])
  await prisma.$executeRawUnsafe(`ALTER TABLE "Asignaciones_Guardia" ADD CONSTRAINT "planning_rollback" CHECK ("usuario_id" <> ${data.secondary.user.id})`)
  try {
    await data.plan({ ...data.input, reemplazar_existentes: true }).expect(500)
    expect(await data.assignments()).toEqual([original])
  } finally { await prisma.$executeRawUnsafe('ALTER TABLE "Asignaciones_Guardia" DROP CONSTRAINT "planning_rollback"') }
  await data.plan({ ...data.input, reemplazar_existentes: true }).expect(200)
  expect((await data.assignments()).some(a => a.usuario_id === data.other.user.id)).toBe(false)
})

it('revalidates active technicians, roles, delegation and calendar ownership before planning', async () => {
  const data = await fixture()
  const outsideDelegation = await createDelegation()
  const outside = await createActor(outsideDelegation.id)
  await data.plan({ ...data.input, principal_id: outside.user.id }).expect(400)
  await data.plan({ ...data.input, principal_id: data.supervisor.user.id }).expect(400)
  await prisma.usuario.update({ where: { id: data.primary.user.id }, data: { activo: false } })
  await data.plan().expect(400)
  const outsiderSupervisor = await createActor(outsideDelegation.id, 'SUPERVISOR')
  await request(app).post('/api/guardias/calendario/planificar').set('Authorization', `Bearer ${outsiderSupervisor.token}`).send(data.input).expect(403)
  expect(await data.assignments()).toEqual([])
})

it('serializes competing cyclic plans without silently replacing the winner', async () => {
  const data = await fixture()
  const barrier = createReadBarrier()
  const original = prisma.$transaction.bind(prisma)
  const spy = vi.spyOn(prisma, '$transaction')
  spy.mockImplementation(((work: (tx: Prisma.TransactionClient) => Promise<unknown>, options: object) =>
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
  try {
    const responses = await Promise.all([data.plan(), data.plan({ ...data.input, principal_id: data.other.user.id })])
    expect(responses.map(r => r.status).sort()).toEqual([200, 409])
    expect(barrier.arrivals).toBe(2)
    expect(spy.mock.calls.length).toBeGreaterThanOrEqual(3)
    expect(spy.mock.calls.length).toBeLessThanOrEqual(6)
    const winner = responses[0].status === 200 ? data.primary.user.id : data.other.user.id
    const rows = await data.assignments()
    expect(rows.filter(a => a.rol_guardia_id === data.role.id).every(a => a.usuario_id === winner)).toBe(true)
    expect(rows).toHaveLength(data.shifts.filter((_, i) => i % 3 === 0).length * 2)
  } finally { barrier.close() }
})
