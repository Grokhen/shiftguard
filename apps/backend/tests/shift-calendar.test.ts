import request from 'supertest'
import * as jwt from 'jsonwebtoken'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { app } from '../src/app'
import { calendarWeeks, permissionShiftRange } from '../src/utils/shiftCalendar'
import { monthDays, shiftsOnDay } from '../../frontend/src/utils/shiftCalendar'

const db = vi.hoisted(() => ({
  usuario: { findFirst: vi.fn(), findMany: vi.fn() },
  guardia: { findMany: vi.fn(), createMany: vi.fn() },
  $transaction: vi.fn(),
}))
vi.mock('../src/prisma', () => ({ prisma: db }))
function token(roleCode = 'SUPERVISOR') {
  db.usuario.findFirst.mockResolvedValue({ id: 10, rol_id: 7, delegacion_id: 8,
    Rol: { codigo: roleCode }, password_actualizada_en: null, requiere_reset: false })
  return jwt.sign({ sub: 10, role: 7, roleCode, deleg: 8, passwordVersion: 0 }, process.env.JWT_SECRET!, { expiresIn: '15m' })
}
beforeEach(() => {
  vi.resetAllMocks()
  db.guardia.findMany.mockResolvedValue([])
  db.guardia.createMany.mockResolvedValue({ count: 53 })
  db.usuario.findMany.mockResolvedValue([])
  db.$transaction.mockImplementation(work => work(db))
})

describe('natural weeks in Madrid', () => {
  it('lays out months Monday first, including February without inventing days', () => {
    const days = monthDays(2026, 1)
    expect(days[0].value).toBe('2026-01-26')
    expect(days.at(-1)!.value).toBe('2026-03-01')
    expect(days.filter(d => d.current)).toHaveLength(28)
  })
  it('marks a whole local week and excludes the next Monday in the frontend', () => {
    const shift = { id: 1, delegacion_id: 8, estado: 'PLANIFICADA', fecha_inicio: '2026-03-22T23:00:00Z', fecha_fin: '2026-03-29T22:00:00Z' }
    expect(shiftsOnDay([shift], '2026-03-23')).toEqual([shift])
    expect(shiftsOnDay([shift], '2026-03-29')).toEqual([shift])
    expect(shiftsOnDay([shift], '2026-03-30')).toEqual([])
    expect(shiftsOnDay([shift], '2026-03-22')).toEqual([])
  })
  it('includes adjacent years and exactly adjoining Monday boundaries', () => {
    const weeks = calendarWeeks(2026)
    expect(weeks).toHaveLength(53)
    expect(weeks[0].fecha_inicio.toISOString()).toBe('2025-12-28T23:00:00.000Z')
    expect(weeks.at(-1)!.fecha_fin.toISOString()).toBe('2027-01-03T23:00:00.000Z')
    weeks.slice(1).forEach((week, i) => expect(week.fecha_inicio).toEqual(weeks[i].fecha_fin))
  })
  it('preserves local midnight during both DST changes', () => {
    const hours = calendarWeeks(2026).map(w => (w.fecha_fin.getTime() - w.fecha_inicio.getTime()) / 3_600_000)
    expect(hours.filter(h => h !== 168)).toEqual([167, 169])
  })
  it('reuses the same week when viewing adjacent years', () => {
    expect(calendarWeeks(2026).at(-1)).toEqual(calendarWeeks(2027)[0])
  })
  it('compares inclusive permission days with exclusive shift ends', () => {
    expect(permissionShiftRange('2026-03-29', '2026-03-29')).toEqual({
      desde: new Date('2026-03-28T23:00:00Z'), hasta: new Date('2026-03-29T22:00:00Z'),
    })
  })
})

describe('calendar access and generation', () => {
  it('creates empty weeks only for the authenticated delegation', async () => {
    const response = await request(app).post('/api/guardias/calendario')
      .set('Authorization', `Bearer ${token()}`).send({ anio: 2026 }).expect(200)
    expect(response.body.creadas).toBe(53)
    const rows = db.guardia.createMany.mock.calls[0][0].data
    expect(rows.every((row: { delegacion_id: number }) => row.delegacion_id === 8)).toBe(true)
    expect(rows[0]).not.toHaveProperty('Asignaciones')
    expect(db.$transaction.mock.calls[0][1]).toEqual({ isolationLevel: 'Serializable' })
  })
  it('keeps prior weeks and nonweekly shifts instead of overwriting them', async () => {
    db.guardia.findMany.mockResolvedValue([{ ...calendarWeeks(2026)[0], id: 1 }, {
      id: 2, fecha_inicio: new Date('2026-01-07T10:00:00Z'), fecha_fin: new Date('2026-01-07T20:00:00Z'),
    }])
    const response = await request(app).post('/api/guardias/calendario')
      .set('Authorization', `Bearer ${token()}`).send({ anio: 2026 }).expect(200)
    expect(response.body).toMatchObject({ creadas: 51, guardias_previas: 1 })
  })
  it('does not write when every week is already present', async () => {
    db.guardia.findMany.mockResolvedValue(calendarWeeks(2026))
    await request(app).post('/api/guardias/calendario').set('Authorization', `Bearer ${token()}`)
      .send({ anio: 2026 }).expect(200)
    expect(db.guardia.createMany).not.toHaveBeenCalled()
  })
  it('allows a technician to read only their delegation with safely selected colleagues', async () => {
    await request(app).get('/api/guardias/calendario?anio=2026')
      .set('Authorization', `Bearer ${token('TECNICO')}`).expect(200)
    const query = db.guardia.findMany.mock.calls[0][0]
    expect(query.where.delegacion_id).toBe(8)
    expect(query.include.Asignaciones.where).toEqual({ Usuario: { delegacion_id: 8 } })
    expect(query.include.Asignaciones.include.Usuario.select).not.toHaveProperty('password_hash')
  })
  it('denies generation to technicians', async () => {
    await request(app).post('/api/guardias/calendario').set('Authorization', `Bearer ${token('TECNICO')}`)
      .send({ anio: 2026 }).expect(403)
    expect(db.$transaction).not.toHaveBeenCalled()
  })
  it.each([1999, 2101, 2026.5, 'bad'])('rejects an invalid generation year %s', async anio => {
    await request(app).post('/api/guardias/calendario').set('Authorization', `Bearer ${token()}`)
      .send({ anio }).expect(400)
    expect(db.$transaction).not.toHaveBeenCalled()
  })
  it('rejects a delegation override', async () => {
    await request(app).get('/api/guardias/calendario?anio=2026&delegacion_id=99')
      .set('Authorization', `Bearer ${token()}`).expect(400)
    expect(db.guardia.findMany).not.toHaveBeenCalled()
  })
  it('lists active technicians across the delegation without requiring team membership', async () => {
    await request(app).get('/api/guardias/tecnicos').set('Authorization', `Bearer ${token()}`).expect(200)
    expect(db.usuario.findMany.mock.calls[0][0].where).toEqual({ delegacion_id: 8, activo: true, Rol: { codigo: 'TECNICO' } })
    await request(app).get('/api/guardias/tecnicos').set('Authorization', `Bearer ${token('TECNICO')}`).expect(403)
  })
})
