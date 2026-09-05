import { randomUUID } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import request from 'supertest'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { app } from '../src/app'
import { prisma } from '../src/prisma'
import { createActor, createDelegation, synchronizeTransactionReads } from './helpers'

beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => {}))
afterEach(() => vi.restoreAllMocks())
afterAll(() => prisma.$disconnect())

async function fixture() {
  const source = await createDelegation()
  const destination = await createDelegation()
  const admin = await createActor(source.id, 'ADMIN')
  const supervisor = await createActor(source.id, 'SUPERVISOR')
  const technician = await createActor(source.id)
  const team = await prisma.equipo.create({
    data: { nombre_equipo: 'Integration team', delegacion_id: source.id },
  })
  const shiftRole = await prisma.rolGuardia.create({
    data: { codigo: randomUUID().slice(0, 20), nombre: 'Integration role' },
  })
  return { source, destination, admin, supervisor, technician, team, shiftRole }
}

type Fixture = Awaited<ReturnType<typeof fixture>>

function transfer(data: Fixture, entity: 'usuario' | 'equipo', token = data.admin.token) {
  const path =
    entity === 'usuario' ? `usuarios/${data.technician.user.id}` : `equipos/${data.team.id}`
  return request(app)
    .patch(`/api/${path}`)
    .set('Authorization', `Bearer ${token}`)
    .send({
      delegacion_id: data.destination.id,
      ...(entity === 'usuario' ? { nombre: 'Transferred' } : { nombre_equipo: 'Transferred' }),
    })
}

function addMember(data: Fixture) {
  return request(app)
    .post(`/api/equipos/${data.team.id}/miembros`)
    .set('Authorization', `Bearer ${data.supervisor.token}`)
    .send({ usuario_id: data.technician.user.id })
}

// Relative dates keep current/future/historical cases valid as the suite ages.
function interval(kind: 'past' | 'ongoing' | 'future') {
  const now = Date.now()
  const day = 24 * 60 * 60 * 1000
  return {
    fecha_inicio: new Date(now + (kind === 'future' ? day : -2 * day)),
    fecha_fin: new Date(now + (kind === 'past' ? -day : 2 * day)),
  }
}

async function storedShift(data: Fixture, kind: 'past' | 'ongoing' | 'future', assigned = true) {
  return prisma.guardia.create({
    data: {
      delegacion_id: data.source.id,
      ...interval(kind),
      Asignaciones: assigned
        ? {
            create: {
              usuario_id: data.technician.user.id,
              rol_guardia_id: data.shiftRole.id,
            },
          }
        : undefined,
    },
    include: { Asignaciones: true },
  })
}

describe('transfers persisted in PostgreSQL', () => {
  it.each(['usuario', 'equipo'] as const)(
    'blocks the %s transfer until its membership is removed',
    async (entity) => {
      const data = await fixture()
      const membership = await addMember(data).expect(201)
      await transfer(data, entity).expect(409)
      expect(
        await prisma.usuario.findUniqueOrThrow({ where: { id: data.technician.user.id } }),
      ).toEqual(data.technician.user)
      expect(await prisma.equipo.findUniqueOrThrow({ where: { id: data.team.id } })).toEqual(
        data.team,
      )
      expect(await prisma.miembroEquipo.findMany({ where: { equipo_id: data.team.id } })).toEqual([
        membership.body,
      ])

      await request(app)
        .delete(`/api/equipos/${data.team.id}/miembros/${data.technician.user.id}`)
        .set('Authorization', `Bearer ${data.supervisor.token}`)
        .expect(204)
      const moved = await transfer(data, entity).expect(200)
      expect(moved.body.delegacion_id).toBe(data.destination.id)
      expect(moved.body).not.toHaveProperty('password_hash')
      const stored =
        entity === 'usuario'
          ? await prisma.usuario.findUniqueOrThrow({ where: { id: data.technician.user.id } })
          : await prisma.equipo.findUniqueOrThrow({ where: { id: data.team.id } })
      expect(stored.delegacion_id).toBe(data.destination.id)
      await addMember(data).expect(entity === 'usuario' ? 400 : 403)
      expect(await prisma.miembroEquipo.count({ where: { equipo_id: data.team.id } })).toBe(0)
    },
  )

  it.each(['ongoing', 'future'] as const)(
    'rejects a user transfer with a %s shift without partial edits',
    async (kind) => {
      const data = await fixture()
      const shift = await storedShift(data, kind)
      await transfer(data, 'usuario').expect(409)
      expect(
        await prisma.usuario.findUniqueOrThrow({ where: { id: data.technician.user.id } }),
      ).toEqual(data.technician.user)
      expect(
        await prisma.guardia.findUniqueOrThrow({
          where: { id: shift.id },
          include: { Asignaciones: true },
        }),
      ).toEqual(shift)
    },
  )

  it('preserves historical assignments and invalidates the old session after a user transfer', async () => {
    const data = await fixture()
    const shift = await storedShift(data, 'past')
    await transfer(data, 'usuario').expect(200)
    expect(
      await prisma.guardia.findUniqueOrThrow({
        where: { id: shift.id },
        include: { Asignaciones: true },
      }),
    ).toEqual(shift)
    expect(
      await prisma.usuario.findUniqueOrThrow({ where: { id: data.technician.user.id } }),
    ).toMatchObject({ delegacion_id: data.destination.id, nombre: 'Transferred' })
    await request(app)
      .get('/api/usuarios/me')
      .set('Authorization', `Bearer ${data.technician.token}`)
      .expect(401)
    await request(app)
      .patch(`/api/guardias/${shift.id}`)
      .set('Authorization', `Bearer ${data.supervisor.token}`)
      .send(interval('future'))
      .expect(400)
    expect(
      await prisma.guardia.findUniqueOrThrow({
        where: { id: shift.id },
        include: { Asignaciones: true },
      }),
    ).toEqual(shift)
  })

  it.each(['usuario', 'equipo'] as const)(
    'reserves %s transfers for administrators',
    async (entity) => {
      const data = await fixture()
      await transfer(data, entity, data.supervisor.token).expect(403)
      await transfer(data, entity, data.technician.token).expect(403)
      expect(
        await prisma.usuario.findUniqueOrThrow({ where: { id: data.technician.user.id } }),
      ).toEqual(data.technician.user)
      expect(await prisma.equipo.findUniqueOrThrow({ where: { id: data.team.id } })).toEqual(
        data.team,
      )
    },
  )

  it('rolls back a team transfer when its destination already has the requested name', async () => {
    const data = await fixture()
    await prisma.equipo.create({
      data: { nombre_equipo: 'Transferred', delegacion_id: data.destination.id },
    })
    const response = await transfer(data, 'equipo').expect(409)
    expect(response.body).toEqual({ error: 'El registro ya existe' })
    expect(await prisma.equipo.findUniqueOrThrow({ where: { id: data.team.id } })).toEqual(
      data.team,
    )
  })
})

describe('transfers racing with new relationships in PostgreSQL', () => {
  it.each(['usuario', 'equipo'] as const)(
    'serializes a %s transfer against adding a team member',
    async (entity) => {
      const data = await fixture()
      const race = synchronizeTransactionReads([
        entity === 'usuario'
          ? { model: 'asignacionGuardia', method: 'findFirst' }
          : { model: 'miembroEquipo', method: 'findFirst' },
        {
          model: 'usuario',
          method: 'findUnique',
          // Membership selects the delegation; transfer reads the complete user.
          matches: ([args]) => Boolean((args as Prisma.UsuarioFindUniqueArgs).select),
        },
      ])
      try {
        const [moveResponse, memberResponse] = await Promise.all([
          transfer(data, entity),
          addMember(data),
        ])
        expect([
          [200, entity === 'usuario' ? 400 : 403],
          [409, 201],
        ]).toContainEqual([moveResponse.status, memberResponse.status])
        expect(race.arrivals).toBe(2)
        expect(race.spy).toHaveBeenCalledTimes(3)
        const user = await prisma.usuario.findUniqueOrThrow({
          where: { id: data.technician.user.id },
        })
        const team = await prisma.equipo.findUniqueOrThrow({ where: { id: data.team.id } })
        const members = await prisma.miembroEquipo.findMany({ where: { equipo_id: data.team.id } })
        expect(members).toHaveLength(memberResponse.status === 201 ? 1 : 0)
        if (members.length) {
          expect(user).toEqual(data.technician.user)
          expect(team).toEqual(data.team)
        } else {
          expect(entity === 'usuario' ? user.delegacion_id : team.delegacion_id).toBe(
            data.destination.id,
          )
        }
      } finally {
        race.close()
      }
    },
  )

  it.each(['create', 'assign', 'reschedule'] as const)(
    'serializes a user transfer against shift %s',
    async (operation) => {
      const data = await fixture()
      const existing =
        operation === 'create' ? null : await storedShift(data, 'past', operation === 'reschedule')
      const assignment = { usuario_id: data.technician.user.id, rol_guardia_id: data.shiftRole.id }
      const race = synchronizeTransactionReads([
        { model: 'asignacionGuardia', method: 'findFirst' },
        { model: 'rolGuardia', method: 'findMany' },
      ])
      try {
        // An explicit assignment must target a current/future shift to block a transfer.
        if (operation === 'assign') {
          await prisma.guardia.update({ where: { id: existing!.id }, data: interval('future') })
        }
        const shiftRequest =
          operation === 'create'
            ? request(app)
                .post('/api/guardias')
                .send({ ...interval('future'), asignaciones: [assignment] })
            : operation === 'assign'
              ? request(app).post(`/api/guardias/${existing!.id}/asignaciones`).send(assignment)
              : request(app).patch(`/api/guardias/${existing!.id}`).send(interval('future'))
        const before =
          existing &&
          (await prisma.guardia.findUniqueOrThrow({
            where: { id: existing.id },
            include: { Asignaciones: true },
          }))
        const [moveResponse, shiftResponse] = await Promise.all([
          transfer(data, 'usuario'),
          shiftRequest.set('Authorization', `Bearer ${data.supervisor.token}`),
        ])
        const success = operation === 'reschedule' ? 200 : 201
        expect([
          [200, 400],
          [409, success],
        ]).toContainEqual([moveResponse.status, shiftResponse.status])
        expect(race.arrivals).toBe(2)
        expect(race.spy).toHaveBeenCalledTimes(3)
        const user = await prisma.usuario.findUniqueOrThrow({
          where: { id: data.technician.user.id },
        })
        const shifts = await prisma.guardia.findMany({
          where: { delegacion_id: data.source.id },
          include: { Asignaciones: true },
        })
        if (moveResponse.status === 200) {
          expect(user.delegacion_id).toBe(data.destination.id)
          expect(shifts).toEqual(before ? [before] : [])
        } else {
          expect(user).toEqual(data.technician.user)
          expect(shifts).toHaveLength(1)
          expect(shifts[0].fecha_fin.getTime()).toBeGreaterThan(Date.now())
          expect(shifts[0].Asignaciones).toEqual([expect.objectContaining(assignment)])
        }
      } finally {
        race.close()
      }
    },
  )
})
