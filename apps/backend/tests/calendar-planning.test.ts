import request from 'supertest'
import * as jwt from 'jsonwebtoken'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { app } from '../src/app'
import { calendarWeeks, currentShiftYear, recurringCalendarWeeks } from '../src/utils/shiftCalendar'
import { calendarWeekStarts, recurringWeekStarts, shiftDay } from '../../frontend/src/utils/shiftCalendar'

const db = vi.hoisted(() => ({
  usuario: { findFirst: vi.fn(), findMany: vi.fn() },
  guardia: { findUnique: vi.fn(), findMany: vi.fn() },
  rolGuardia: { findMany: vi.fn() },
  asignacionGuardia: { deleteMany: vi.fn(), createMany: vi.fn() },
  $transaction: vi.fn(),
}))
vi.mock('../src/prisma', () => ({ prisma: db }))
const weeks = calendarWeeks(2026)
const stored = () => weeks.map((w, i) => ({ ...w, id: i + 1, delegacion_id: 8, Asignaciones: [] as { usuario_id: number; rol_guardia_id: number }[] }))
const input = { anio: 2026, guardia_id: 1, principal_id: 20, secundario_id: 21, frecuencia_semanas: 3 }
function token(roleCode = 'SUPERVISOR') {
  db.usuario.findFirst.mockResolvedValue({ id: 10, rol_id: 7, delegacion_id: 8,
    Rol: { codigo: roleCode }, password_actualizada_en: null, requiere_reset: false })
  return jwt.sign({ sub: 10, role: 7, roleCode, deleg: 8, passwordVersion: 0 }, process.env.JWT_SECRET!, { expiresIn: '15m' })
}
const plan = (body: object = input) => request(app).post('/api/guardias/calendario/planificar')
  .set('Authorization', `Bearer ${token()}`).send(body)

beforeEach(() => {
  vi.resetAllMocks()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-21T12:00:00Z'))
  db.$transaction.mockImplementation(work => work(db))
  db.guardia.findUnique.mockResolvedValue(stored()[0])
  db.guardia.findMany.mockResolvedValue(stored())
  db.usuario.findMany.mockImplementation(({ where }) => where.id.in.map((id: number) => ({ id })))
  db.rolGuardia.findMany.mockResolvedValue([{ id: 11, codigo: 'PRINCIPAL' }, { id: 19, codigo: 'SECUNDARIO' }])
})
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('calendar-based recurrence', () => {
  it('counts three calendar weeks across DST instead of adding 504 hours', () => {
    const start = weeks[11].fecha_inicio
    const series = recurringCalendarWeeks(2026, start, 3)
    expect(series[1]).toEqual(weeks[14])
    expect((series[1].fecha_inicio.getTime() - start.getTime()) / 3_600_000).toBe(503)
    expect(series.every(w => w.fecha_inicio <= weeks.at(-1)!.fecha_inicio)).toBe(true)
  })
  it.each([2000, 2012, 2026, 2027])('keeps frontend previews and backend target weeks aligned in %s', year => {
    const backend = calendarWeeks(year)
    expect(calendarWeekStarts(year)).toEqual(backend.map(w => shiftDay(w.fecha_inicio.toISOString())))
    const start = backend[5].fecha_inicio
    expect(recurringWeekStarts(year, shiftDay(start.toISOString()), 3)).toEqual(recurringCalendarWeeks(year, start, 3).map(w => shiftDay(w.fecha_inicio.toISOString())))
  })
  it('uses Madrid for the current year even while UTC is still in December', () => {
    expect(currentShiftYear(new Date('2026-12-31T23:30:00Z'))).toBe(2027)
  })
})

describe('annual planning API', () => {
  it('assigns a pair every three weeks together and never adds next-year weeks', async () => {
    const response = await plan().expect(200)
    const targets = weeks.filter((_, i) => i % 3 === 0)
    expect(response.body).toMatchObject({ programadas: targets.length, actualizadas: targets.length, anio: 2026 })
    const rows = db.asignacionGuardia.createMany.mock.calls[0][0].data
    expect(rows).toHaveLength(targets.length * 2)
    expect(rows.filter((r: { usuario_id: number }) => r.usuario_id === 20).map((r: { guardia_id: number }) => r.guardia_id))
      .toEqual(stored().filter((_, i) => i % 3 === 0).map(s => s.id))
    expect(db.$transaction.mock.calls[0][1]).toEqual({ isolationLevel: 'Serializable' })
    expect(db.usuario.findMany.mock.calls[0][0].where).toMatchObject({ activo: true, delegacion_id: 8, Rol: { codigo: 'TECNICO' } })
  })
  it('assigns just one week when frequency is omitted', async () => {
    await plan({ anio: 2026, guardia_id: 1, principal_id: 20 }).expect(200)
    expect(db.asignacionGuardia.createMany.mock.calls[0][0].data).toEqual([{ usuario_id: 20, rol_guardia_id: 11, guardia_id: 1 }])
  })
  it.each([0, -1, 1.5, 54, '3', null])('rejects invalid frequency %s without writing', async frecuencia_semanas => {
    await plan({ ...input, frecuencia_semanas }).expect(400)
    expect(db.asignacionGuardia.deleteMany).not.toHaveBeenCalled()
  })
  it('accepts the number of weeks in the year as its maximum', async () => {
    const response = await plan({ ...input, frecuencia_semanas: weeks.length }).expect(200)
    expect(response.body.programadas).toBe(1)
  })
  it.each([2025, 2027])('rejects planning outside the current year: %s', async anio => {
    await plan({ ...input, anio }).expect(400)
    expect(db.$transaction).not.toHaveBeenCalled()
  })
  it('denies technicians and an attempted delegation override', async () => {
    await request(app).post('/api/guardias/calendario/planificar').set('Authorization', `Bearer ${token('TECNICO')}`).send(input).expect(403)
    await plan({ ...input, delegacion_id: 99 }).expect(400)
    db.guardia.findUnique.mockResolvedValue({ ...stored()[0], delegacion_id: 99 })
    await plan().expect(403)
    expect(db.asignacionGuardia.deleteMany).not.toHaveBeenCalled()
  })
  it('rejects duplicate or unavailable technicians', async () => {
    await plan({ ...input, secundario_id: input.principal_id }).expect(400)
    db.usuario.findMany.mockResolvedValue([])
    await plan().expect(400)
    expect(db.asignacionGuardia.deleteMany).not.toHaveBeenCalled()
  })
  it('rejects a legacy nonweekly shift and a series with missing weeks before any deletion', async () => {
    db.guardia.findUnique.mockResolvedValue({ ...stored()[0], fecha_fin: new Date('2026-01-01') })
    await plan().expect(400)
    db.guardia.findUnique.mockResolvedValue(stored()[0])
    db.guardia.findMany.mockResolvedValue(stored().slice(1))
    await plan().expect(409)
    expect(db.asignacionGuardia.deleteMany).not.toHaveBeenCalled()
  })
  it('requires explicit replacement and preserves identical plans without rewriting them', async () => {
    const records = stored()
    records[0].Asignaciones = [{ usuario_id: 99, rol_guardia_id: 11 }]
    db.guardia.findMany.mockResolvedValue(records)
    const conflict = await plan().expect(409)
    expect(conflict.body).toMatchObject({ code: 'CALENDAR_ASSIGNMENTS_EXIST', guardias_conflicto: [1] })
    expect(db.asignacionGuardia.deleteMany).not.toHaveBeenCalled()
    await plan({ ...input, reemplazar_existentes: true }).expect(200)
    db.asignacionGuardia.deleteMany.mockClear()
    records.forEach((r, i) => { if (i % 3 === 0) r.Asignaciones = [{ usuario_id: 20, rol_guardia_id: 11 }, { usuario_id: 21, rol_guardia_id: 19 }] })
    const same = await plan().expect(200)
    expect(same.body.actualizadas).toBe(0)
    expect(db.asignacionGuardia.deleteMany).not.toHaveBeenCalled()
  })
})
