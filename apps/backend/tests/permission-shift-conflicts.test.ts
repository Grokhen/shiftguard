import request from 'supertest'
import * as jwt from 'jsonwebtoken'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { app } from '../src/app'
import { permissionShiftRange } from '../src/utils/shiftCalendar'
import { ApiRequestError, authorizedPost } from '../../frontend/src/services/apiClient'

const db = vi.hoisted(() => ({
  usuario: { findFirst: vi.fn() }, asignacionGuardia: { findMany: vi.fn() },
  permiso: { create: vi.fn(), findMany: vi.fn() },
  tipoPermiso: { findUnique: vi.fn() }, estadoPermiso: { findUnique: vi.fn() },
}))
vi.mock('../src/prisma', () => ({ prisma: db }))
function token(roleCode = 'TECNICO') {
  db.usuario.findFirst.mockResolvedValue({ id: 10, rol_id: 7, delegacion_id: 8,
    Rol: { codigo: roleCode }, password_actualizada_en: null, requiere_reset: false })
  return jwt.sign({ sub: 10, role: 7, roleCode, deleg: 8, passwordVersion: 0 }, process.env.JWT_SECRET!, { expiresIn: '15m' })
}
const dates = { fecha_inicio: '2026-03-29', fecha_fin: '2026-03-29' }
const shift = { id: 15, delegacion_id: 8, fecha_inicio: new Date('2026-03-22T23:00:00Z'), fecha_fin: new Date('2026-03-29T22:00:00Z') }
beforeEach(() => {
  vi.resetAllMocks()
  db.asignacionGuardia.findMany.mockResolvedValue([{ usuario_id: 10, Guardia: shift }])
  db.tipoPermiso.findUnique.mockResolvedValue({ id: 1 })
  db.estadoPermiso.findUnique.mockResolvedValue({ id: 2, codigo: 'PENDIENTE' })
  db.permiso.create.mockImplementation(async ({ data }) => ({ id: 20, ...data }))
})
afterEach(() => vi.unstubAllGlobals())

describe('permission conflicts and substitute proposals', () => {
  it('checks only the authenticated user and delegation using complete local days', async () => {
    const result = await request(app).post('/api/permisos/comprobar-guardias')
      .set('Authorization', `Bearer ${token()}`).send(dates).expect(200)
    expect(result.body.conflictos_guardias).toEqual([{ id: 15, fecha_inicio: shift.fecha_inicio.toISOString(), fecha_fin: shift.fecha_fin.toISOString() }])
    expect(db.asignacionGuardia.findMany.mock.calls[0][0].where.OR).toEqual([{ usuario_id: 10, Guardia: {
      delegacion_id: 8, fecha_inicio: { lt: new Date('2026-03-29T22:00:00Z') }, fecha_fin: { gt: new Date('2026-03-28T23:00:00Z') },
    } }])
  })
  it('rejects an attempted user override and invalid date before reading assignments', async () => {
    await request(app).post('/api/permisos/comprobar-guardias').set('Authorization', `Bearer ${token()}`)
      .send({ ...dates, usuario_id: 99 }).expect(400)
    await request(app).post('/api/permisos/comprobar-guardias').set('Authorization', `Bearer ${token()}`)
      .send({ ...dates, fecha_fin: '2026-02-30' }).expect(400)
    expect(db.asignacionGuardia.findMany).not.toHaveBeenCalled()
  })
  it('rechecks on creation and requires explicit confirmation before writing', async () => {
    const response = await request(app).post('/api/permisos').set('Authorization', `Bearer ${token()}`)
      .send({ ...dates, tipo_id: 1 }).expect(409)
    expect(response.body.code).toBe('SHIFT_CONFLICT')
    expect(db.permiso.create).not.toHaveBeenCalled()
  })
  it.each([undefined, '  Nerea Prueba  '])('accepts a confirmed conflict with optional substitute %s', async sustituto_nombre => {
    const response = await request(app).post('/api/permisos').set('Authorization', `Bearer ${token()}`)
      .send({ ...dates, tipo_id: 1, observaciones: 'Mis observaciones', confirmar_conflicto_guardias: true, sustituto_nombre }).expect(201)
    expect(response.body).toMatchObject({ usuario_id: 10, observaciones: 'Mis observaciones', sustituto_nombre: sustituto_nombre?.trim() ?? null })
    expect(db.permiso.create.mock.calls[0][0].data).not.toHaveProperty('confirmar_conflicto_guardias')
  })
  it('bounds substitute input before database work', async () => {
    await request(app).post('/api/permisos').set('Authorization', `Bearer ${token()}`)
      .send({ ...dates, tipo_id: 1, sustituto_nombre: 'a'.repeat(201) }).expect(400)
    expect(db.permiso.create).not.toHaveBeenCalled()
    expect(db.asignacionGuardia.findMany).not.toHaveBeenCalled()
  })
  it('requires no confirmation for an unassigned period', async () => {
    db.asignacionGuardia.findMany.mockResolvedValue([])
    await request(app).post('/api/permisos').set('Authorization', `Bearer ${token()}`)
      .send({ ...dates, tipo_id: 1 }).expect(201)
  })
  it('recomputes each inbox conflict from current assignments without disclosing other users', async () => {
    db.permiso.findMany.mockResolvedValue([{ id: 20, usuario_id: 10, Usuario: { delegacion_id: 8 }, fecha_inicio: new Date(dates.fecha_inicio), fecha_fin: new Date(dates.fecha_fin) }])
    const inbox = () => request(app).get('/api/permisos/pendientes').set('Authorization', `Bearer ${token('SUPERVISOR')}`)
    expect((await inbox().expect(200)).body[0].conflictos_guardias).toHaveLength(1)
    db.asignacionGuardia.findMany.mockResolvedValue([])
    expect((await inbox().expect(200)).body[0].conflictos_guardias).toHaveLength(0)
  })
  it.each(['0001-01-01', '9999-12-31'])('retains the existing permission date domain: %s', value => {
    const range = permissionShiftRange(value, value)
    expect(Number.isFinite(range.desde.getTime())).toBe(true)
    expect(range.hasta.getTime()).toBeGreaterThan(range.desde.getTime())
  })
  it('keeps structured conflict details through the frontend API client', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'Conflicto', code: 'SHIFT_CONFLICT', conflictos_guardias: [{ id: 15 }] }), { status: 409 })))
    try { await authorizedPost('/api/permisos', 'token', dates); throw new Error('Expected a conflict') }
    catch (error) { expect(error).toBeInstanceOf(ApiRequestError); expect((error as ApiRequestError).details.code).toBe('SHIFT_CONFLICT') }
  })
})
