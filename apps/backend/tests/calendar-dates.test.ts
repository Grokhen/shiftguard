import request from 'supertest'
import * as jwt from 'jsonwebtoken'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { app } from '../src/app'
import {
  formatCalendarDateLong,
  formatCalendarDateRange,
  isCalendarDateActive,
} from '../../frontend/src/utils/date'

const db = vi.hoisted(() => ({
  usuario: { findFirst: vi.fn() },
  permiso: { create: vi.fn(), findMany: vi.fn() },
  tipoPermiso: { findUnique: vi.fn() },
  estadoPermiso: { findUnique: vi.fn() },
  equipo: { findUnique: vi.fn() },
  miembroEquipo: { findMany: vi.fn() },
}))
vi.mock('../src/prisma', () => ({ prisma: db }))

function session() {
  db.usuario.findFirst.mockResolvedValue({
    id: 10,
    rol_id: 2,
    Rol: { codigo: 'SUPERVISOR' },
    delegacion_id: 1,
    password_actualizada_en: null,
    requiere_reset: false,
  })
  return jwt.sign(
    { sub: 10, role: 2, roleCode: 'SUPERVISOR', deleg: 1, passwordVersion: 0 },
    process.env.JWT_SECRET!,
    { expiresIn: '15m' },
  )
}

beforeEach(() => {
  vi.resetAllMocks()
  db.tipoPermiso.findUnique.mockResolvedValue({ id: 1 })
  db.estadoPermiso.findUnique.mockResolvedValue({ id: 1, codigo: 'PENDIENTE' })
  db.permiso.create.mockResolvedValue({ id: 1 })
  db.permiso.findMany.mockResolvedValue([])
  db.equipo.findUnique.mockResolvedValue({ id: 1, delegacion_id: 1 })
  db.miembroEquipo.findMany.mockResolvedValue([{ usuario_id: 10 }])
})
afterEach(() => vi.unstubAllEnvs())

describe('permission calendar date input', () => {
  it.each([
    '2026-02-29',
    '2026-02-30',
    '2026-04-31',
    '2026-13-01',
    '0000-01-01',
    '09/05/2026',
    '2026-9-5',
    '2026-09-05T00:00:00.000Z',
    '2026-09-05T23:00:00-02:00',
  ])('rejects an invalid or ambiguous calendar date before writing: %s', async (date) => {
    await request(app)
      .post('/api/permisos')
      .set('Authorization', `Bearer ${session()}`)
      .send({ tipo_id: 1, fecha_inicio: date, fecha_fin: '2027-01-01' })
      .expect(400)
    expect(db.tipoPermiso.findUnique).not.toHaveBeenCalled()
    expect(db.permiso.create).not.toHaveBeenCalled()
  })

  it('also validates the end date', async () => {
    await request(app)
      .post('/api/permisos')
      .set('Authorization', `Bearer ${session()}`)
      .send({ tipo_id: 1, fecha_inicio: '2026-02-01', fecha_fin: '2026-02-30' })
      .expect(400)
    expect(db.permiso.create).not.toHaveBeenCalled()
  })

  it.each(['2024-02-29', '2026-12-31', '0001-01-01'])(
    'stores a valid one-day permission at UTC midnight: %s',
    async (date) => {
      vi.stubEnv('TZ', 'America/Los_Angeles')
      await request(app)
        .post('/api/permisos')
        .set('Authorization', `Bearer ${session()}`)
        .send({ tipo_id: 1, fecha_inicio: date, fecha_fin: date })
        .expect(201)
      expect(db.permiso.create.mock.calls[0][0].data).toMatchObject({
        fecha_inicio: new Date(`${date}T00:00:00.000Z`),
        fecha_fin: new Date(`${date}T00:00:00.000Z`),
      })
    },
  )

  it('rejects an inverted interval', async () => {
    await request(app)
      .post('/api/permisos')
      .set('Authorization', `Bearer ${session()}`)
      .send({ tipo_id: 1, fecha_inicio: '2026-09-06', fecha_fin: '2026-09-05' })
      .expect(400)
    expect(db.permiso.create).not.toHaveBeenCalled()
  })
})

describe.each(['/api/permisos/mios', '/api/equipos/1/permisos'])(
  'annual permission filter on %s',
  (path) => {
    it.each(['0', '-1', '10000', '2026.5', 'invalid', ''])(
      'rejects an invalid year: %s',
      async (year) => {
        await request(app)
          .get(`${path}?anio=${year}`)
          .set('Authorization', `Bearer ${session()}`)
          .expect(400)
        expect(db.permiso.findMany).not.toHaveBeenCalled()
      },
    )

    it.each(['Europe/Madrid', 'America/Los_Angeles'])(
      'uses inclusive intersection and UTC boundaries in %s',
      async (timezone) => {
        vi.stubEnv('TZ', timezone)
        await request(app)
          .get(`${path}?anio=2026`)
          .set('Authorization', `Bearer ${session()}`)
          .expect(200)
        const where = db.permiso.findMany.mock.calls[0][0].where
        expect(where.fecha_inicio).toEqual({ lte: new Date('2026-12-31T00:00:00.000Z') })
        expect(where.fecha_fin).toEqual({ gte: new Date('2026-01-01T00:00:00.000Z') })
        // A permission ending on January 1 or beginning on December 31 belongs to this year.
        for (const [start, end, included] of [
          ['2025-12-20', '2026-01-01', true],
          ['2026-12-31', '2027-01-03', true],
          ['2025-12-20', '2027-01-03', true],
          ['2025-12-20', '2025-12-31', false],
          ['2027-01-01', '2027-01-03', false],
        ] as const) {
          expect(
            new Date(start) <= where.fecha_inicio.lte && new Date(end) >= where.fecha_fin.gte,
          ).toBe(included)
        }
      },
    )

    it('preserves years below 100 instead of interpreting them as 1900-based years', async () => {
      await request(app)
        .get(`${path}?anio=1`)
        .set('Authorization', `Bearer ${session()}`)
        .expect(200)
      const where = db.permiso.findMany.mock.calls[0][0].where
      expect(where.fecha_inicio.lte.toISOString()).toBe('0001-12-31T00:00:00.000Z')
      expect(where.fecha_fin.gte.toISOString()).toBe('0001-01-01T00:00:00.000Z')
    })
  },
)

describe('calendar dates in the frontend', () => {
  it.each(['Europe/Madrid', 'America/Los_Angeles', 'Pacific/Kiritimati'])(
    'preserves the date displayed to users in %s',
    (timezone) => {
      vi.stubEnv('TZ', timezone)
      expect(formatCalendarDateLong('2026-09-05T00:00:00.000Z')).toBe(
        'sábado, 05 de septiembre de 2026',
      )
      expect(formatCalendarDateRange('2025-12-31T00:00:00.000Z', '2026-01-01T00:00:00.000Z')).toBe(
        '31/12/2025 — 01/01/2026',
      )
      expect(formatCalendarDateRange('2024-02-29', '2024-02-29')).toBe('29/02/2024 — 29/02/2024')
    },
  )

  it.each(['Europe/Madrid', 'America/Los_Angeles', 'Pacific/Kiritimati'])(
    'includes the whole first and last day according to the local calendar in %s',
    (timezone) => {
      vi.stubEnv('TZ', timezone)
      const start = '2026-09-05T00:00:00.000Z'
      const end = '2026-09-06T00:00:00.000Z'
      expect(isCalendarDateActive(start, end, new Date(2026, 8, 4, 23, 59))).toBe(false)
      expect(isCalendarDateActive(start, end, new Date(2026, 8, 5, 0, 0))).toBe(true)
      expect(isCalendarDateActive(start, end, new Date(2026, 8, 6, 23, 59))).toBe(true)
      expect(isCalendarDateActive(start, end, new Date(2026, 8, 7, 0, 0))).toBe(false)
    },
  )
})
