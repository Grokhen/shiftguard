import request from 'supertest'
import * as jwt from 'jsonwebtoken'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { app } from '../src/app'
import { isShiftActive } from '../../frontend/src/utils/date'

const db = vi.hoisted(() => ({
  usuario: { findFirst: vi.fn() },
  guardia: {
    create: vi.fn(),
    update: vi.fn(),
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
  },
  asignacionGuardia: { findMany: vi.fn() },
  $transaction: vi.fn(),
}))
vi.mock('../src/prisma', () => ({ prisma: db }))

const start = '2026-09-05T08:00:00.000Z'
const end = '2026-09-05T20:00:00.000Z'

function session(roleCode = 'SUPERVISOR') {
  db.usuario.findFirst.mockResolvedValue({
    id: 10,
    rol_id: 2,
    Rol: { codigo: roleCode },
    delegacion_id: 1,
    password_actualizada_en: null,
    requiere_reset: false,
  })
  return jwt.sign(
    { sub: 10, role: 2, roleCode, deleg: 1, passwordVersion: 0 },
    process.env.JWT_SECRET!,
    { expiresIn: '15m' },
  )
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  db.$transaction.mockImplementation(async (work) => work(db))
  db.guardia.findFirst.mockResolvedValue(null)
  db.guardia.findUnique.mockResolvedValue({
    id: 1,
    delegacion_id: 1,
    fecha_inicio: new Date(start),
    fecha_fin: new Date(end),
    Asignaciones: [],
  })
  db.guardia.create.mockResolvedValue({ id: 1 })
  db.guardia.findMany.mockResolvedValue([])
  db.asignacionGuardia.findMany.mockResolvedValue([])
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe.each(['post', 'patch'] as const)('guardia timestamps on %s', (method) => {
  const path = method === 'post' ? '/api/guardias' : '/api/guardias/1'

  it.each([
    '2026-02-29T08:00:00Z',
    '2026-02-30T08:00:00Z',
    '2026-04-31T08:00:00Z',
    '2026-13-01T08:00:00Z',
    '2026-09-05T24:00:00Z',
    '2026-09-05T08:00:00+24:00',
    '2026-09-05T08:00:00+02:60',
    '2026-09-05T08:00:00',
    '2026-09-05',
    '09/05/2026 08:00',
    '0000-01-01T00:00:00Z',
    '0001-01-01T00:00:00+01:00',
    '9999-12-31T23:30:00-01:00',
    '2026-09-05T08:00:00.0001Z',
  ])('rejects invalid or lossy input before a transaction: %s', async (date) => {
    const response = await request(app)
      [method](path)
      .set('Authorization', `Bearer ${session()}`)
      .send({ fecha_inicio: date, fecha_fin: end })
      .expect(400)
    expect(response.body.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: ['fecha_inicio'] })]),
    )
    expect(db.$transaction).not.toHaveBeenCalled()
    expect(db.guardia.create).not.toHaveBeenCalled()
    expect(db.guardia.update).not.toHaveBeenCalled()
  })

  it('also validates the end timestamp', async () => {
    await request(app)
      [method](path)
      .set('Authorization', `Bearer ${session()}`)
      .send({ fecha_inicio: start, fecha_fin: '2026-09-31T20:00:00Z' })
      .expect(400)
    expect(db.$transaction).not.toHaveBeenCalled()
  })

  it.each([
    [start, start],
    [end, start],
    ['2026-09-05T10:00:00+02:00', start],
  ])('rejects an empty or inverted interval by instant: %s to %s', async (from, to) => {
    await request(app)
      [method](path)
      .set('Authorization', `Bearer ${session()}`)
      .send({ fecha_inicio: from, fecha_fin: to })
      .expect(400)
    expect(db.$transaction).not.toHaveBeenCalled()
  })

  it('compares instants across the repeated hour at the end of daylight saving time', async () => {
    await request(app)
      [method](path)
      .set('Authorization', `Bearer ${session()}`)
      .send({ fecha_inicio: '2026-10-25T02:30:00+02:00', fecha_fin: '2026-10-25T02:15:00+01:00' })
      .expect(method === 'post' ? 201 : 200)
    const write = method === 'post' ? db.guardia.create : db.guardia.update
    expect(write.mock.calls[0][0].data).toMatchObject({
      fecha_inicio: new Date('2026-10-25T00:30:00Z'),
      fecha_fin: new Date('2026-10-25T01:15:00Z'),
    })
  })
})

describe('valid guardia timestamps', () => {
  it.each([
    '2024-02-29T08:00Z',
    '2024-02-29T08:00:00Z',
    '2024-02-29T08:00:00.1Z',
    '2024-02-29T08:00:00.12Z',
    '2024-02-29T08:00:00.123Z',
    '2024-02-29T10:00:00+02:00',
    '2024-02-29T03:00:00-05:00',
    '0001-01-01T00:00:00Z',
  ])('stores an explicit instant independently of the server timezone: %s', async (date) => {
    vi.stubEnv('TZ', 'America/Los_Angeles')
    const to = new Date(Date.parse(date) + 3_600_000).toISOString()
    await request(app)
      .post('/api/guardias')
      .set('Authorization', `Bearer ${session()}`)
      .send({ fecha_inicio: date, fecha_fin: to })
      .expect(201)
    expect(db.guardia.create.mock.calls[0][0].data).toMatchObject({
      fecha_inicio: new Date(date),
      fecha_fin: new Date(to),
    })
  })

  it.each([{ fecha_inicio: end }, { fecha_fin: start }])(
    'checks partial edits against the stored opposite endpoint: %j',
    async (payload) => {
      await request(app)
        .patch('/api/guardias/1')
        .set('Authorization', `Bearer ${session()}`)
        .send(payload)
        .expect(400)
      expect(db.$transaction).toHaveBeenCalledOnce()
      expect(db.guardia.update).not.toHaveBeenCalled()
    },
  )

  it('retains the stored start when updating only the end', async () => {
    await request(app)
      .patch('/api/guardias/1')
      .set('Authorization', `Bearer ${session()}`)
      .send({ fecha_fin: '2026-09-05T23:00:00+02:00' })
      .expect(200)
    expect(db.guardia.update.mock.calls[0][0].data).toMatchObject({
      fecha_inicio: new Date(start),
      fecha_fin: new Date('2026-09-05T21:00:00Z'),
    })
  })
})

describe.each(['/api/guardias', '/api/guardias/mias', '/api/guardias/delegacion/1'])(
  'guardia range queries on %s',
  (path) => {
    function queriedRange() {
      if (path.endsWith('/mias')) {
        const where = db.asignacionGuardia.findMany.mock.calls[0][0].where
        expect(where.usuario_id).toBe(10)
        return where.Guardia
      }
      const { delegacion_id, ...range } = db.guardia.findMany.mock.calls[0][0].where
      expect(delegacion_id).toBe(1)
      return range
    }

    it('includes ongoing shifts and excludes shifts touching only an endpoint', async () => {
      await request(app)
        .get(path)
        .query({ desde: '2026-09-05T10:00:00+02:00', hasta: '2026-09-05T22:00:00+02:00' })
        .set('Authorization', `Bearer ${session()}`)
        .expect(200)
      // A shift starting before 08:00 is still included if it ends after 08:00.
      // Shifts ending at 08:00 or starting at 20:00 are outside [08:00, 20:00).
      expect(queriedRange()).toEqual({
        fecha_fin: { gt: new Date(start) },
        fecha_inicio: { lt: new Date(end) },
      })
    })

    it.each([
      [{ desde: start }, { fecha_fin: { gt: new Date(start) } }],
      [{ hasta: end }, { fecha_inicio: { lt: new Date(end) } }],
      [{}, {}],
    ])('supports one-sided and absent ranges: %j', async (query, expected) => {
      await request(app)
        .get(path)
        .query(query)
        .set('Authorization', `Bearer ${session()}`)
        .expect(200)
      expect(queriedRange()).toEqual(expected)
    })

    it.each([
      { desde: '2026-02-30T08:00:00Z' },
      { hasta: '2026-09-05T20:00:00' },
      { desde: '' },
      { desde: start, hasta: start },
      { desde: end, hasta: start },
      { desde: '2026-09-05T10:00:00+02:00', hasta: start },
    ])('rejects invalid or empty ranges before reading guardias: %j', async (query) => {
      await request(app)
        .get(path)
        .query(query)
        .set('Authorization', `Bearer ${session()}`)
        .expect(400)
      expect(db.guardia.findMany).not.toHaveBeenCalled()
      expect(db.asignacionGuardia.findMany).not.toHaveBeenCalled()
    })
  },
)

describe('delegation authorization with range filters', () => {
  it.each(['SUPERVISOR', 'TECNICO'])('rejects access to another delegation as %s', async (role) => {
    await request(app)
      .get('/api/guardias/delegacion/2')
      .query({ desde: start, hasta: end })
      .set('Authorization', `Bearer ${session(role)}`)
      .expect(403)
    expect(db.guardia.findMany).not.toHaveBeenCalled()
  })

  it('lets an administrator query another delegation within a range', async () => {
    await request(app)
      .get('/api/guardias/delegacion/2')
      .query({ desde: start, hasta: end })
      .set('Authorization', `Bearer ${session('ADMIN')}`)
      .expect(200)
    expect(db.guardia.findMany.mock.calls[0][0].where).toEqual({
      delegacion_id: 2,
      fecha_fin: { gt: new Date(start) },
      fecha_inicio: { lt: new Date(end) },
    })
  })
})

describe('active guardias in the frontend', () => {
  it.each(['Europe/Madrid', 'America/Los_Angeles', 'Pacific/Kiritimati'])(
    'selects only the incoming shift at a handover, in %s',
    (timezone) => {
      vi.stubEnv('TZ', timezone)
      const nextEnd = '2026-09-06T08:00:00.000Z'
      expect(isShiftActive(start, end, new Date(Date.parse(start) - 1))).toBe(false)
      expect(isShiftActive(start, end, new Date(start))).toBe(true)
      expect(isShiftActive(start, end, new Date(Date.parse(end) - 1))).toBe(true)
      expect(isShiftActive(start, end, new Date(end))).toBe(false)
      expect(isShiftActive(end, nextEnd, new Date(end))).toBe(true)
    },
  )
})
