import type { Prisma } from '@prisma/client'
import request from 'supertest'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { app } from '../src/app'
import { prisma } from '../src/prisma'
import { createActor, createDelegation, createReadBarrier } from './helpers'

beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => {}))
afterEach(() => vi.restoreAllMocks())
afterAll(() => prisma.$disconnect())

async function fixture() {
  const delegation = await createDelegation()
  const otherDelegation = await createDelegation()
  const technician = await createActor(delegation.id)
  const first = await createActor(delegation.id, 'SUPERVISOR')
  const second = await createActor(delegation.id, 'SUPERVISOR')
  const outsider = await createActor(otherDelegation.id, 'SUPERVISOR')
  const admin = await createActor(otherDelegation.id, 'ADMIN')
  const state = (codigo: string) =>
    prisma.estadoPermiso.upsert({
      where: { codigo },
      create: { codigo, nombre: codigo },
      update: {},
    })
  const pending = await state('PENDIENTE')
  const approved = await state('APROBADO')
  const rejected = await state('RECHAZADO')
  const type = await prisma.tipoPermiso.upsert({
    where: { codigo: 'VACACIONES' },
    create: { codigo: 'VACACIONES', nombre: 'Vacaciones' },
    update: {},
  })
  const created = await request(app)
    .post('/api/permisos')
    .set('Authorization', `Bearer ${technician.token}`)
    .send({
      tipo_id: type.id,
      fecha_inicio: '2027-01-01',
      fecha_fin: '2027-01-03',
      observaciones: 'Original request',
    })
    .expect(201)
  const permission = await prisma.permiso.findUniqueOrThrow({ where: { id: created.body.id } })
  expect(permission.estado_id).toBe(pending.id)
  return {
    delegation,
    otherDelegation,
    technician,
    first,
    second,
    outsider,
    admin,
    pending,
    approved,
    rejected,
    permission,
  }
}

type Fixture = Awaited<ReturnType<typeof fixture>>
type Actor = Awaited<ReturnType<typeof createActor>>

function decide(data: Fixture, actor: Actor, estadoId: number, observaciones?: string) {
  return request(app)
    .patch(`/api/permisos/${data.permission.id}/decidir`)
    .set('Authorization', `Bearer ${actor.token}`)
    .send({ estado_id: estadoId, observaciones })
}

// Keep Prisma's real results (including Estado and Usuario) and only delay delivery
// until both HTTP requests have read the pending state from PostgreSQL.
// Routes await this lookup directly; the scheduling wrapper does not expose Prisma's
// fluent relation methods, which is why the spy needs a type assertion.
function synchronizeDecisionReads() {
  const barrier = createReadBarrier()
  const original = prisma.permiso.findUnique.bind(prisma.permiso)
  const spy = vi.spyOn(prisma.permiso, 'findUnique')
  spy.mockImplementation((async (args: Prisma.PermisoFindUniqueArgs) => {
    const result = await original(args)
    await barrier.wait()
    return result
  }) as unknown as typeof prisma.permiso.findUnique)
  return {
    get arrivals() {
      return barrier.arrivals
    },
    close() {
      barrier.close()
      spy.mockRestore()
    },
  }
}

describe('permission decisions persisted under concurrency in PostgreSQL', () => {
  it.each(['opposite', 'same'] as const)(
    'accepts only one of two %s decisions and keeps its author and notes',
    async (kind) => {
      const data = await fixture()
      const choices = [
        { actor: data.first, state: data.approved.id, notes: 'First decision' },
        {
          actor: data.second,
          state: kind === 'same' ? data.approved.id : data.rejected.id,
          notes: 'Second decision',
        },
      ]
      const race = synchronizeDecisionReads()
      try {
        const responses = await Promise.all(
          choices.map(({ actor, state, notes }) => decide(data, actor, state, notes)),
        )
        expect(responses.map((response) => response.status).sort()).toEqual([200, 409])
        expect(race.arrivals).toBe(2)
        const winnerIndex = responses.findIndex((response) => response.status === 200)
        const winner = choices[winnerIndex]
        const loser = choices[1 - winnerIndex]
        expect(responses[1 - winnerIndex].body).toEqual({
          error: 'El permiso ha cambiado. Actualiza la lista antes de decidir.',
        })
        const stored = await prisma.permiso.findUniqueOrThrow({ where: { id: data.permission.id } })
        expect(stored).toEqual({
          ...data.permission,
          estado_id: winner.state,
          decidido_por: winner.actor.user.id,
          observaciones: winner.notes,
        })
        expect(responses[winnerIndex].body).toMatchObject({
          id: stored.id,
          estado_id: winner.state,
          decidido_por: winner.actor.user.id,
          observaciones: winner.notes,
        })
        expect(JSON.stringify(responses[winnerIndex].body)).not.toContain('password_hash')

        // A later retry sees the terminal state, while the losing concurrent write got 409.
        await decide(data, loser.actor, loser.state, loser.notes).expect(400)
        expect(await prisma.permiso.findUniqueOrThrow({ where: { id: stored.id } })).toEqual(stored)
        const inbox = await request(app)
          .get('/api/permisos/pendientes')
          .set('Authorization', `Bearer ${data.first.token}`)
          .expect(200)
        expect(inbox.body).toEqual([])
      } finally {
        race.close()
      }
    },
  )

  it('keeps an out-of-delegation supervisor from competing with an administrator', async () => {
    const data = await fixture()
    const race = synchronizeDecisionReads()
    try {
      const [allowed, forbidden] = await Promise.all([
        decide(data, data.admin, data.approved.id),
        decide(data, data.outsider, data.rejected.id, 'Forbidden decision'),
      ])
      expect([allowed.status, forbidden.status]).toEqual([200, 403])
      expect(race.arrivals).toBe(2)
      expect(forbidden.body).toEqual({ error: 'No puedes decidir permisos de otra delegación' })
      expect(await prisma.permiso.findUniqueOrThrow({ where: { id: data.permission.id } })).toEqual(
        {
          ...data.permission,
          estado_id: data.approved.id,
          decidido_por: data.admin.user.id,
        },
      )
    } finally {
      race.close()
    }
  })

  it('does not let a technician decide their own pending request', async () => {
    const data = await fixture()
    await decide(data, data.technician, data.approved.id).expect(403)
    expect(await prisma.permiso.findUniqueOrThrow({ where: { id: data.permission.id } })).toEqual(
      data.permission,
    )
  })
})

describe('permission decisions overlapping a requester transfer', () => {
  it.each(['supervisor', 'admin'] as const)(
    'rechecks the scope of a %s after the requester moves',
    async (role) => {
      const data = await fixture()
      const original = prisma.permiso.findUnique.bind(prisma.permiso)
      const read = vi.spyOn(prisma.permiso, 'findUnique')
      read.mockImplementationOnce((async (args: Prisma.PermisoFindUniqueArgs) => {
        const result = await original(args)
        // The decision already read the old delegation. Commit an actual API transfer
        // before allowing it to reach UPDATE; no Prisma result is fabricated.
        await request(app)
          .patch(`/api/usuarios/${data.technician.user.id}`)
          .set('Authorization', `Bearer ${data.admin.token}`)
          .send({ delegacion_id: data.otherDelegation.id })
          .expect(200)
        return result
      }) as unknown as typeof prisma.permiso.findUnique)
      try {
        const response = await decide(
          data,
          role === 'admin' ? data.admin : data.first,
          data.approved.id,
          'After transfer',
        )
        expect(response.status).toBe(role === 'admin' ? 200 : 409)
        expect(read).toHaveBeenCalledTimes(1)
      } finally {
        read.mockRestore()
      }
      expect(
        await prisma.usuario.findUniqueOrThrow({ where: { id: data.technician.user.id } }),
      ).toMatchObject({ delegacion_id: data.otherDelegation.id })
      const stored = await prisma.permiso.findUniqueOrThrow({ where: { id: data.permission.id } })
      if (role === 'admin') {
        expect(stored).toEqual({
          ...data.permission,
          estado_id: data.approved.id,
          decidido_por: data.admin.user.id,
          observaciones: 'After transfer',
        })
      } else {
        expect(stored).toEqual(data.permission)
        await decide(data, data.first, data.approved.id).expect(403)
        const oldInbox = await request(app)
          .get('/api/permisos/pendientes')
          .set('Authorization', `Bearer ${data.first.token}`)
          .expect(200)
        expect(oldInbox.body).toEqual([])
        const newInbox = await request(app)
          .get('/api/permisos/pendientes')
          .set('Authorization', `Bearer ${data.outsider.token}`)
          .expect(200)
        expect(newInbox.body.map((item: { id: number }) => item.id)).toEqual([data.permission.id])
        expect(JSON.stringify(newInbox.body)).not.toContain('password_hash')
        await decide(data, data.outsider, data.rejected.id).expect(200)
        expect(
          await prisma.permiso.findUniqueOrThrow({ where: { id: data.permission.id } }),
        ).toEqual({
          ...data.permission,
          estado_id: data.rejected.id,
          decidido_por: data.outsider.user.id,
        })
      }
    },
  )
})
