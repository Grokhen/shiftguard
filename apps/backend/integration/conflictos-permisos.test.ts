import request from 'supertest'
import { afterAll, expect, it } from 'vitest'
import { app } from '../src/app'
import { prisma } from '../src/prisma'
import { createActor, createDelegation } from './helpers'

afterAll(() => prisma.$disconnect())
const dates = { fecha_inicio: '2026-03-29', fecha_fin: '2026-03-29' }
async function fixture(assigned = true) {
  const delegation = await createDelegation()
  const technician = await createActor(delegation.id)
  const substitute = await createActor(delegation.id)
  const supervisor = await createActor(delegation.id, 'SUPERVISOR')
  const outsider = await createActor((await createDelegation()).id, 'SUPERVISOR')
  const role = await prisma.rolGuardia.upsert({ where: { codigo: 'PRINCIPAL' }, create: { codigo: 'PRINCIPAL', nombre: 'Principal' }, update: {} })
  const type = await prisma.tipoPermiso.upsert({ where: { codigo: 'VACACIONES' }, create: { codigo: 'VACACIONES', nombre: 'Vacaciones' }, update: {} })
  await prisma.estadoPermiso.upsert({ where: { codigo: 'PENDIENTE' }, create: { codigo: 'PENDIENTE', nombre: 'Pendiente' }, update: {} })
  const shift = await prisma.guardia.create({ data: { delegacion_id: delegation.id,
    fecha_inicio: new Date('2026-03-22T23:00:00Z'), fecha_fin: new Date('2026-03-29T22:00:00Z'),
    Asignaciones: assigned ? { create: { usuario_id: technician.user.id, rol_guardia_id: role.id } } : undefined,
  } })
  return { delegation, technician, substitute, supervisor, outsider, role, type, shift }
}

it.each([undefined, 'Nerea Prueba'])('persists a confirmed conflict with substitute %s and updates its live flag after reassignment', async name => {
  const data = await fixture()
  const check = await request(app).post('/api/permisos/comprobar-guardias')
    .set('Authorization', `Bearer ${data.technician.token}`).send(dates).expect(200)
  expect(check.body.conflictos_guardias.map((s: { id: number }) => s.id)).toEqual([data.shift.id])
  const input = { ...dates, tipo_id: data.type.id, observaciones: 'Necesito este día\nGracias', sustituto_nombre: name }
  await request(app).post('/api/permisos').set('Authorization', `Bearer ${data.technician.token}`).send(input).expect(409)
  expect(await prisma.permiso.count({ where: { usuario_id: data.technician.user.id } })).toBe(0)
  const created = await request(app).post('/api/permisos').set('Authorization', `Bearer ${data.technician.token}`)
    .send({ ...input, confirmar_conflicto_guardias: true }).expect(201)
  const stored = await prisma.permiso.findUniqueOrThrow({ where: { id: created.body.id } })
  expect(stored).toMatchObject({ sustituto_nombre: name ?? null, observaciones: input.observaciones })
  const inbox = () => request(app).get('/api/permisos/pendientes').set('Authorization', `Bearer ${data.supervisor.token}`)
  const pending = await inbox().expect(200)
  expect(pending.body[0].conflictos_guardias).toHaveLength(1)
  expect(pending.body[0].sustituto_nombre).toBe(name ?? null)
  expect(JSON.stringify(pending.body)).not.toContain('password_hash')
  const other = await request(app).get('/api/permisos/pendientes').set('Authorization', `Bearer ${data.outsider.token}`).expect(200)
  expect(other.body).toEqual([])
  // Proposing a name has not silently changed any assignment.
  expect((await prisma.asignacionGuardia.findMany({ where: { guardia_id: data.shift.id } }))[0].usuario_id).toBe(data.technician.user.id)
  await request(app).patch(`/api/guardias/${data.shift.id}`).set('Authorization', `Bearer ${data.supervisor.token}`)
    .send({ asignaciones: [{ usuario_id: data.substitute.user.id, rol_guardia_id: data.role.id }] }).expect(200)
  const changed = await inbox().expect(200)
  expect(changed.body[0].conflictos_guardias).toEqual([])
  expect(changed.body[0].sustituto_nombre).toBe(name ?? null)
})

it('rechecks new assignments after a clean preflight, including exclusive Monday boundaries', async () => {
  const data = await fixture(false)
  const check = (body: object) => request(app).post('/api/permisos/comprobar-guardias')
    .set('Authorization', `Bearer ${data.technician.token}`).send(body)
  expect((await check(dates).expect(200)).body.conflictos_guardias).toEqual([])
  await request(app).post(`/api/guardias/${data.shift.id}/asignaciones`)
    .set('Authorization', `Bearer ${data.supervisor.token}`)
    .send({ usuario_id: data.technician.user.id, rol_guardia_id: data.role.id }).expect(201)
  await request(app).post('/api/permisos').set('Authorization', `Bearer ${data.technician.token}`)
    .send({ ...dates, tipo_id: data.type.id }).expect(409)
  expect((await check({ fecha_inicio: '2026-03-30', fecha_fin: '2026-03-30' }).expect(200)).body.conflictos_guardias).toEqual([])
  await check({ ...dates, usuario_id: data.substitute.user.id }).expect(400)
})
