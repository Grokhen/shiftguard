import request from 'supertest'
import * as jwt from 'jsonwebtoken'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { app } from '../src/app'
import { getPermisosPendientes } from '../../frontend/src/services/permisosService'

const db = vi.hoisted(() => ({
  usuario: { findFirst: vi.fn() },
  permiso: { findMany: vi.fn() },
  equipo: { findMany: vi.fn() },
  miembroEquipo: { findMany: vi.fn() },
}))
vi.mock('../src/prisma', () => ({ prisma: db }))

function session(roleCode = 'SUPERVISOR', deleg = 1, requiere_reset = false) {
  db.usuario.findFirst.mockResolvedValue({
    id: 10,
    rol_id: 12,
    delegacion_id: deleg,
    Rol: { codigo: roleCode },
    password_actualizada_en: null,
    requiere_reset,
  })
  return jwt.sign(
    { sub: 10, role: 12, roleCode, deleg, passwordVersion: 0 },
    process.env.JWT_SECRET!,
    { expiresIn: '15m' },
  )
}

beforeEach(() => {
  vi.resetAllMocks()
  db.permiso.findMany.mockResolvedValue([])
})

describe('delegation pending-permission inbox', () => {
  it('queries pending permissions directly within the supervisor delegation, with a safe user selection', async () => {
    await request(app)
      .get('/api/permisos/pendientes')
      .set('Authorization', `Bearer ${session()}`)
      .expect(200)
    expect(db.permiso.findMany).toHaveBeenCalledWith({
      where: { Estado: { codigo: 'PENDIENTE' }, Usuario: { delegacion_id: 1 } },
      include: {
        Tipo: true,
        Estado: true,
        Usuario: {
          select: {
            id: true,
            nombre: true,
            apellidos: true,
            email: true,
            delegacion_id: true,
          },
        },
      },
      orderBy: [{ fecha_inicio: 'asc' }, { id: 'asc' }],
    })
    expect(db.equipo.findMany).not.toHaveBeenCalled()
    expect(db.miembroEquipo.findMany).not.toHaveBeenCalled()
  })

  it('returns records from different years without multiplying a request by team memberships', async () => {
    // Persistence returns one record per permission, regardless of the applicant's teams.
    db.permiso.findMany.mockResolvedValue([
      { id: 1, usuario_id: 20, fecha_inicio: '2025-12-30', fecha_fin: '2026-01-03' },
      { id: 2, usuario_id: 21, fecha_inicio: '2027-01-10', fecha_fin: '2027-01-12' },
    ])
    const response = await request(app)
      .get('/api/permisos/pendientes')
      .set('Authorization', `Bearer ${session()}`)
      .expect(200)
    expect(response.body.map((item: { id: number }) => item.id)).toEqual([1, 2])
    expect(db.permiso.findMany).toHaveBeenCalledTimes(1)
    const where = db.permiso.findMany.mock.calls[0][0].where
    expect(where).not.toHaveProperty('fecha_inicio')
    expect(where).not.toHaveProperty('fecha_fin')
    expect(where.Usuario).toEqual({ delegacion_id: 1 })
  })

  it('allows the supervisor to specify only their own delegation', async () => {
    await request(app)
      .get('/api/permisos/pendientes?delegacion_id=7')
      .set('Authorization', `Bearer ${session('SUPERVISOR', 7)}`)
      .expect(200)
    expect(db.permiso.findMany.mock.calls[0][0].where.Usuario).toEqual({ delegacion_id: 7 })
  })

  it('rejects an attempted delegation override before querying permissions', async () => {
    await request(app)
      .get('/api/permisos/pendientes?delegacion_id=2')
      .set('Authorization', `Bearer ${session()}`)
      .expect(403)
    expect(db.permiso.findMany).not.toHaveBeenCalled()
  })

  it('allows an administrator to query all delegations', async () => {
    await request(app)
      .get('/api/permisos/pendientes')
      .set('Authorization', `Bearer ${session('ADMIN')}`)
      .expect(200)
    expect(db.permiso.findMany.mock.calls[0][0].where).toEqual({ Estado: { codigo: 'PENDIENTE' } })
  })

  it('allows an administrator to filter a specific delegation', async () => {
    await request(app)
      .get('/api/permisos/pendientes?delegacion_id=2')
      .set('Authorization', `Bearer ${session('ADMIN')}`)
      .expect(200)
    expect(db.permiso.findMany.mock.calls[0][0].where).toEqual({
      Estado: { codigo: 'PENDIENTE' },
      Usuario: { delegacion_id: 2 },
    })
  })

  it('denies technicians access to the inbox', async () => {
    await request(app)
      .get('/api/permisos/pendientes')
      .set('Authorization', `Bearer ${session('TECNICO')}`)
      .expect(403)
    expect(db.permiso.findMany).not.toHaveBeenCalled()
  })

  it('requires authentication', async () => {
    await request(app).get('/api/permisos/pendientes').expect(401)
    expect(db.permiso.findMany).not.toHaveBeenCalled()
  })

  it('enforces mandatory password changes on the new endpoint', async () => {
    const response = await request(app)
      .get('/api/permisos/pendientes')
      .set('Authorization', `Bearer ${session('SUPERVISOR', 1, true)}`)
      .expect(403)
    expect(response.body.code).toBe('PASSWORD_CHANGE_REQUIRED')
    expect(db.permiso.findMany).not.toHaveBeenCalled()
  })

  it.each([
    'delegacion_id=0',
    'delegacion_id=-1',
    'delegacion_id=abc',
    'delegacion_id=1.5',
    'anio=2026',
    'estado_id=2',
  ])('rejects invalid or unsupported filters: %s', async (query) => {
    await request(app)
      .get(`/api/permisos/pendientes?${query}`)
      .set('Authorization', `Bearer ${session()}`)
      .expect(400)
    expect(db.permiso.findMany).not.toHaveBeenCalled()
  })

  it.each([undefined, 3])(
    'uses one client request without requiring teams or a year: %s',
    async (delegacionId) => {
      const fetch = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(new Response('[]', { status: 200 }))
      try {
        await expect(getPermisosPendientes('token', delegacionId)).resolves.toEqual([])
        const path =
          delegacionId === undefined
            ? '/api/permisos/pendientes'
            : '/api/permisos/pendientes?delegacion_id=3'
        expect(fetch).toHaveBeenCalledOnce()
        expect(fetch).toHaveBeenCalledWith(expect.stringContaining(path), {
          method: 'GET',
          headers: { Authorization: 'Bearer token' },
        })
      } finally {
        fetch.mockRestore()
      }
    },
  )
})
