import request from 'supertest'
import * as jwt from 'jsonwebtoken'
import { Prisma } from '@prisma/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { app } from '../src/app'

const prismaMock = vi.hoisted(() => ({
  usuario: {
    findFirst: vi.fn(),
    updateMany: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
  },
  rolUsuario: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
  },
  guardia: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  delegacion: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  equipo: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  miembroEquipo: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
  },
  asignacionGuardia: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    createMany: vi.fn(),
    deleteMany: vi.fn(),
  },
  rolGuardia: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
  },
  tipoPermiso: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
  },
  estadoPermiso: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
  },
  permiso: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  $transaction: vi.fn(),
}))

const argon2Mock = vi.hoisted(() => ({
  verify: vi.fn(),
  hash: vi.fn(),
}))

vi.mock('../src/prisma', () => ({
  prisma: prismaMock,
}))

vi.mock('argon2', () => ({
  default: argon2Mock,
  ...argon2Mock,
}))

const roles = {
  tecnico: { id: 1, codigo: 'TECNICO', nombre: 'Tecnico' },
  supervisor: { id: 2, codigo: 'SUPERVISOR', nombre: 'Supervisor' },
  admin: { id: 3, codigo: 'ADMIN', nombre: 'Administrador' },
}

function authenticateAs(role: (typeof roles)[keyof typeof roles], deleg = 1, sub = 10) {
  prismaMock.usuario.findFirst.mockResolvedValue({
    id: sub,
    rol_id: role.id,
    delegacion_id: deleg,
    password_actualizada_en: null,
    Rol: { codigo: role.codigo },
  })
  return jwt.sign(
    {
      sub,
      role: role.id,
      roleCode: role.codigo,
      deleg,
      passwordVersion: 0,
    },
    process.env.JWT_SECRET!,
    { expiresIn: '15m' },
  )
}

function mockRoleLookup() {
  prismaMock.rolUsuario.findUnique.mockImplementation(({ where }: { where: { id: number } }) =>
    Promise.resolve(Object.values(roles).find((role) => role.id === where.id) ?? null),
  )
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  mockRoleLookup()
  prismaMock.$transaction.mockImplementation((work) => work(prismaMock))
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('audit regressions: session authorization', () => {
  it('checks active and unblocked account state on every authenticated request', async () => {
    const token = authenticateAs(roles.admin)
    prismaMock.usuario.findMany.mockResolvedValue([])
    await request(app).get('/api/usuarios').set('Authorization', `Bearer ${token}`).expect(200)
    expect(prismaMock.usuario.findFirst).toHaveBeenCalledWith({
      where: { id: 10, activo: true, bloqueado_en: null },
      select: {
        id: true,
        rol_id: true,
        delegacion_id: true,
        password_actualizada_en: true,
        requiere_reset: true,
        Rol: { select: { codigo: true } },
      },
    })

    // A missing, disabled or blocked account no longer matches that lookup.
    prismaMock.usuario.findFirst.mockResolvedValue(null)
    await request(app).get('/api/usuarios').set('Authorization', `Bearer ${token}`).expect(401)
    expect(prismaMock.usuario.findMany).toHaveBeenCalledTimes(1)
  })

  it.each([
    { rol_id: roles.tecnico.id },
    { Rol: { codigo: 'TECNICO' } },
    { delegacion_id: 2 },
    { password_actualizada_en: new Date() },
  ])('invalidates issued tokens after account changes: %j', async (change) => {
    const token = authenticateAs(roles.admin)
    prismaMock.usuario.findFirst.mockResolvedValue({
      id: 10,
      rol_id: roles.admin.id,
      delegacion_id: 1,
      Rol: { codigo: 'ADMIN' },
      password_actualizada_en: null,
      ...change,
    })
    await request(app).get('/api/usuarios').set('Authorization', `Bearer ${token}`).expect(401)
    expect(prismaMock.usuario.findMany).not.toHaveBeenCalled()
  })

  it.each(['expired', 'no-expiry', 'legacy', 'invalid-sub'])(
    'rejects %s tokens before querying data',
    async (kind) => {
      const payload: Record<string, unknown> = {
        sub: 10,
        role: 3,
        roleCode: 'ADMIN',
        deleg: 1,
        passwordVersion: 0,
        exp: Math.floor(Date.now() / 1000) + 900,
      }
      if (kind === 'expired') payload.exp = 1
      if (kind === 'no-expiry') delete payload.exp
      if (kind === 'legacy') delete payload.passwordVersion
      if (kind === 'invalid-sub') payload.sub = 1.5
      const token = jwt.sign(payload, process.env.JWT_SECRET!)
      await request(app).get('/api/usuarios').set('Authorization', `Bearer ${token}`).expect(401)
      expect(prismaMock.usuario.findFirst).not.toHaveBeenCalled()
    },
  )

  it('reports a database failure as a server error without reflecting internals', async () => {
    const token = authenticateAs(roles.admin)
    prismaMock.usuario.findFirst.mockRejectedValue(new Error('private database details'))
    const res = await request(app)
      .get('/api/usuarios')
      .set('Authorization', `Bearer ${token}`)
      .expect(500)
    expect(res.body).toEqual({ error: 'Error interno del servidor' })
  })

  it('revokes the old token after changing a password and accepts a fresh login in the same second', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-09-05T12:00:00.123Z'))
    const token = authenticateAs(roles.tecnico)
    const account = {
      id: 10,
      rol_id: 1,
      delegacion_id: 1,
      Rol: { codigo: 'TECNICO' },
      activo: true,
      bloqueado_en: null,
      password_actualizada_en: null as Date | null,
      password_hash: 'old-hash',
    }
    prismaMock.usuario.findFirst.mockImplementation(async () => account)
    prismaMock.usuario.findUnique.mockImplementation(async () => account)
    argon2Mock.verify.mockResolvedValue(true)
    argon2Mock.hash.mockResolvedValue('new-hash')
    prismaMock.usuario.updateMany.mockImplementation(async ({ data }) => {
      Object.assign(account, data)
      return { count: 1 }
    })

    await request(app)
      .patch('/api/usuarios/me/password')
      .set('Authorization', `Bearer ${token}`)
      .send({ password_actual: 'old-password', password_nueva: 'new-password' })
      .expect(204)
    expect(prismaMock.usuario.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 10, password_hash: 'old-hash' },
      }),
    )
    await request(app)
      .get('/api/guardias/roles')
      .set('Authorization', `Bearer ${token}`)
      .expect(401)

    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'user@example.com', password: 'new-password' })
      .expect(200)
    const decoded = jwt.verify(login.body.access_token, process.env.JWT_SECRET!) as jwt.JwtPayload
    expect(decoded.passwordVersion).toBe(Date.parse('2026-09-05T12:00:00.123Z'))
    prismaMock.rolGuardia.findMany.mockResolvedValue([])
    await request(app)
      .get('/api/guardias/roles')
      .set('Authorization', `Bearer ${login.body.access_token}`)
      .expect(200)
  })

  it('does not overwrite a password changed by a concurrent request', async () => {
    const token = authenticateAs(roles.tecnico)
    prismaMock.usuario.findUnique.mockResolvedValue({ id: 10, password_hash: 'old-hash' })
    argon2Mock.verify.mockResolvedValue(true)
    argon2Mock.hash.mockResolvedValue('new-hash')
    prismaMock.usuario.updateMany.mockResolvedValue({ count: 0 })
    await request(app)
      .patch('/api/usuarios/me/password')
      .set('Authorization', `Bearer ${token}`)
      .send({ password_actual: 'old-password', password_nueva: 'new-password' })
      .expect(409)
  })

  it('updates the password version on an administrative reset', async () => {
    const token = authenticateAs(roles.admin)
    prismaMock.usuario.findUnique.mockResolvedValue({
      id: 20,
      delegacion_id: 1,
      password_actualizada_en: null,
    })
    prismaMock.usuario.update.mockResolvedValue({ id: 20 })
    argon2Mock.hash.mockResolvedValue('new-hash')
    await request(app)
      .patch('/api/usuarios/20')
      .set('Authorization', `Bearer ${token}`)
      .send({ password: 'new-password' })
      .expect(200)
    expect(prismaMock.usuario.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          password_hash: 'new-hash',
          password_actualizada_en: expect.any(Date),
        }),
      }),
    )
    expect(prismaMock.usuario.update.mock.calls[0][0].data).not.toHaveProperty('password')
  })
})

describe('audit regressions: delegation transfers', () => {
  beforeEach(() => {
    prismaMock.usuario.findUnique.mockResolvedValue({ id: 20, delegacion_id: 1 })
    prismaMock.equipo.findUnique.mockResolvedValue({ id: 1, delegacion_id: 1 })
    prismaMock.delegacion.findUnique.mockResolvedValue({ id: 2 })
    prismaMock.miembroEquipo.findFirst.mockResolvedValue(null)
    prismaMock.asignacionGuardia.findFirst.mockResolvedValue(null)
  })

  it('rejects a team transfer that would keep members in another delegation', async () => {
    prismaMock.miembroEquipo.findFirst.mockResolvedValue({ usuario_id: 20 })
    await request(app)
      .patch('/api/equipos/1')
      .set('Authorization', `Bearer ${authenticateAs(roles.admin)}`)
      .send({ delegacion_id: 2 })
      .expect(409)
    expect(prismaMock.equipo.update).not.toHaveBeenCalled()
    expect(prismaMock.miembroEquipo.findFirst).toHaveBeenCalledWith({
      where: { equipo_id: 1, Usuario: { delegacion_id: { not: 2 } } },
    })
  })

  it('allows transferring an empty team in a serializable transaction', async () => {
    prismaMock.equipo.update.mockResolvedValue({ id: 1, delegacion_id: 2 })
    await request(app)
      .patch('/api/equipos/1')
      .set('Authorization', `Bearer ${authenticateAs(roles.admin)}`)
      .send({ delegacion_id: 2 })
      .expect(200)
    expect(prismaMock.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
    })
  })

  it.each(['team', 'shift'])(
    'rejects a user transfer with an incompatible %s',
    async (relation) => {
      if (relation === 'team')
        prismaMock.miembroEquipo.findFirst.mockResolvedValue({ equipo_id: 1 })
      else prismaMock.asignacionGuardia.findFirst.mockResolvedValue({ guardia_id: 1 })
      await request(app)
        .patch('/api/usuarios/20')
        .set('Authorization', `Bearer ${authenticateAs(roles.admin)}`)
        .send({ delegacion_id: 2 })
        .expect(409)
      expect(prismaMock.usuario.update).not.toHaveBeenCalled()
      expect(prismaMock.asignacionGuardia.findFirst).toHaveBeenCalledWith({
        where: {
          usuario_id: 20,
          Guardia: { delegacion_id: { not: 2 }, fecha_fin: { gt: expect.any(Date) } },
        },
      })
    },
  )

  it('allows a user transfer without incompatible teams or current/future shifts', async () => {
    prismaMock.usuario.update.mockResolvedValue({ id: 20, delegacion_id: 2 })
    await request(app)
      .patch('/api/usuarios/20')
      .set('Authorization', `Bearer ${authenticateAs(roles.admin)}`)
      .send({ delegacion_id: 2 })
      .expect(200)
  })

  it.each(['/api/usuarios/20', '/api/equipos/1'])(
    'rejects transfers to an unknown delegation: %s',
    async (path) => {
      prismaMock.delegacion.findUnique.mockResolvedValue(null)
      await request(app)
        .patch(path)
        .set('Authorization', `Bearer ${authenticateAs(roles.admin)}`)
        .send({ delegacion_id: 99 })
        .expect(400)
      expect(prismaMock.usuario.update).not.toHaveBeenCalled()
      expect(prismaMock.equipo.update).not.toHaveBeenCalled()
    },
  )

  it('hides existing inconsistent members from a supervisor while allowing an admin to repair them', async () => {
    prismaMock.equipo.findUnique.mockResolvedValue({
      id: 1,
      delegacion_id: 1,
      Miembros: [
        { usuario_id: 20, Usuario: { id: 20, delegacion_id: 1 } },
        { usuario_id: 21, Usuario: { id: 21, delegacion_id: 2 } },
      ],
    })
    const res = await request(app)
      .get('/api/equipos/1')
      .set('Authorization', `Bearer ${authenticateAs(roles.supervisor)}`)
      .expect(200)
    expect(res.body.Miembros.map((m: { usuario_id: number }) => m.usuario_id)).toEqual([20])
    const admin = await request(app)
      .get('/api/equipos/1')
      .set('Authorization', `Bearer ${authenticateAs(roles.admin)}`)
      .expect(200)
    expect(admin.body.Miembros).toHaveLength(2)
  })
})

function prismaError(code: string) {
  return new Prisma.PrismaClientKnownRequestError('private database details', {
    code,
    clientVersion: '6.19.0',
  })
}

describe('audit regressions: shift integrity and transaction retries', () => {
  const shift = {
    id: 1,
    delegacion_id: 1,
    fecha_inicio: new Date('2026-09-05T08:00:00Z'),
    fecha_fin: new Date('2026-09-05T16:00:00Z'),
    estado: 'PLANIFICADA',
    Asignaciones: [],
  }
  beforeEach(() => {
    prismaMock.guardia.findUnique.mockResolvedValue(shift)
    prismaMock.guardia.findFirst.mockResolvedValue(null)
    prismaMock.guardia.create.mockResolvedValue(shift)
  })

  it.each([
    { fecha_inicio: '2026-09-06T08:00:00Z' },
    { fecha_fin: '2026-09-04T16:00:00Z' },
    { fecha_inicio: '2026-09-05T16:00:00Z' },
    { fecha_fin: '2026-09-05T08:00:00Z' },
  ])('rejects an invalid resulting interval from a partial patch: %j', async (body) => {
    await request(app)
      .patch('/api/guardias/1')
      .set('Authorization', `Bearer ${authenticateAs(roles.supervisor)}`)
      .send(body)
      .expect(400)
    expect(prismaMock.guardia.update).not.toHaveBeenCalled()
    expect(prismaMock.asignacionGuardia.deleteMany).not.toHaveBeenCalled()
  })

  it('accepts a valid partial date update', async () => {
    await request(app)
      .patch('/api/guardias/1')
      .set('Authorization', `Bearer ${authenticateAs(roles.supervisor)}`)
      .send({ fecha_fin: '2026-09-05T18:00:00Z' })
      .expect(200)
    expect(prismaMock.guardia.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: {
        fecha_inicio: shift.fecha_inicio,
        fecha_fin: new Date('2026-09-05T18:00:00Z'),
        estado: 'PLANIFICADA',
      },
    })
  })

  it.each(['create', 'patch', 'assignment'])(
    'rejects inactive assignees on %s',
    async (operation) => {
      prismaMock.usuario.findMany.mockResolvedValue([{ id: 20, delegacion_id: 1, activo: false }])
      const token = authenticateAs(roles.supervisor)
      const assignment = { usuario_id: 20, rol_guardia_id: 1 }
      const req =
        operation === 'patch'
          ? request(app).patch('/api/guardias/1')
          : request(app).post(
              operation === 'create' ? '/api/guardias' : '/api/guardias/1/asignaciones',
            )
      const body =
        operation === 'assignment'
          ? assignment
          : {
              fecha_inicio: shift.fecha_inicio.toISOString(),
              fecha_fin: shift.fecha_fin.toISOString(),
              asignaciones: [assignment],
            }
      await req.set('Authorization', `Bearer ${token}`).send(body).expect(400)
      expect(prismaMock.guardia.create).not.toHaveBeenCalled()
      expect(prismaMock.guardia.update).not.toHaveBeenCalled()
      expect(prismaMock.asignacionGuardia.create).not.toHaveBeenCalled()
    },
  )

  it('revalidates existing assignees when rescheduling a historical shift', async () => {
    prismaMock.guardia.findUnique.mockResolvedValue({
      ...shift,
      Asignaciones: [{ usuario_id: 20, rol_guardia_id: 1 }],
    })
    prismaMock.usuario.findMany.mockResolvedValue([{ id: 20, delegacion_id: 2, activo: true }])
    await request(app)
      .patch('/api/guardias/1')
      .set('Authorization', `Bearer ${authenticateAs(roles.supervisor)}`)
      .send({ fecha_fin: '2027-01-01T08:00:00Z' })
      .expect(400)
    expect(prismaMock.guardia.update).not.toHaveBeenCalled()
  })

  it('rechecks overlaps after a commit serialization failure', async () => {
    prismaMock.guardia.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 2 })
    prismaMock.$transaction.mockImplementationOnce(async (work) => {
      await work(prismaMock)
      throw prismaError('P2034')
    })
    await request(app)
      .post('/api/guardias')
      .set('Authorization', `Bearer ${authenticateAs(roles.supervisor)}`)
      .send({
        fecha_inicio: shift.fecha_inicio.toISOString(),
        fecha_fin: shift.fecha_fin.toISOString(),
      })
      .expect(400)
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(2)
    expect(prismaMock.guardia.findFirst).toHaveBeenCalledTimes(2)
    expect(prismaMock.guardia.create).toHaveBeenCalledTimes(1)
  })

  it('returns a conflict after three serialization failures', async () => {
    prismaMock.$transaction.mockRejectedValue(prismaError('P2034'))
    await request(app)
      .post('/api/guardias')
      .set('Authorization', `Bearer ${authenticateAs(roles.supervisor)}`)
      .send({
        fecha_inicio: shift.fecha_inicio.toISOString(),
        fecha_fin: shift.fecha_fin.toISOString(),
      })
      .expect(409)
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(3)
  })

  it('does not retry unrelated database errors or expose their internal messages', async () => {
    prismaMock.$transaction.mockRejectedValue(prismaError('P2002'))
    const res = await request(app)
      .post('/api/guardias')
      .set('Authorization', `Bearer ${authenticateAs(roles.supervisor)}`)
      .send({
        fecha_inicio: shift.fecha_inicio.toISOString(),
        fecha_fin: shift.fecha_fin.toISOString(),
      })
      .expect(409)
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1)
    expect(res.body).toEqual({ error: 'El registro ya existe' })
  })
})

describe('audit regressions: competing permission decisions', () => {
  it('allows only one decision after two requests read the same pending state', async () => {
    const token = authenticateAs(roles.supervisor)
    let storedState = 1
    let reads = 0
    let release!: () => void
    const bothRead = new Promise<void>((resolve) => {
      release = resolve
    })
    prismaMock.permiso.findUnique.mockImplementation(async () => {
      if (++reads === 2) release()
      await bothRead
      return {
        id: 50,
        estado_id: 1,
        Estado: { codigo: 'PENDIENTE' },
        Usuario: { delegacion_id: 1 },
      }
    })
    prismaMock.estadoPermiso.findUnique.mockImplementation(async ({ where }) => ({
      id: where.id,
      codigo: where.id === 2 ? 'APROBADO' : 'RECHAZADO',
    }))
    prismaMock.permiso.update.mockImplementation(async ({ where, data }) => {
      if (where.estado_id !== storedState) throw prismaError('P2025')
      storedState = data.estado_id
      return { id: 50, ...data }
    })
    const results = await Promise.all(
      [2, 3].map((estado_id) =>
        request(app)
          .patch('/api/permisos/50/decidir')
          .set('Authorization', `Bearer ${token}`)
          .send({ estado_id }),
      ),
    )
    expect(results.map((r) => r.status).sort()).toEqual([200, 409])
    expect([2, 3]).toContain(storedState)
    expect(prismaMock.permiso.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 50, estado_id: 1, Usuario: { delegacion_id: 1 } },
      }),
    )
  })
})

describe('auth login', () => {
  it('rejects excessive attempts before querying the database', async () => {
    prismaMock.usuario.findUnique.mockResolvedValue(null)
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await request(app).post('/api/auth/login')
        .send({ email: 'throttled@example.com', password: 'incorrect-password' })
        .expect(401)
    }
    const response = await request(app).post('/api/auth/login')
      .send({ email: 'throttled@example.com', password: 'incorrect-password' })
      .expect(429)
    expect(Number(response.headers['retry-after'])).toBeGreaterThan(0)
    expect(prismaMock.usuario.findUnique).toHaveBeenCalledTimes(10)
    expect(argon2Mock.verify).not.toHaveBeenCalled()
  })

  it('returns a JWT with stable role code for valid credentials', async () => {
    prismaMock.usuario.findUnique.mockResolvedValue({
      id: 10,
      password_hash: 'stored-hash',
      activo: true,
      bloqueado_en: null,
      rol_id: roles.tecnico.id,
      delegacion_id: 1,
      Rol: {
        codigo: roles.tecnico.codigo,
      },
    })
    prismaMock.usuario.update.mockResolvedValue({})
    argon2Mock.verify.mockResolvedValue(true)

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'tecnico@example.com', password: 'password123' })
      .expect(200)

    expect(res.body.access_token).toEqual(expect.any(String))
    expect(argon2Mock.verify).toHaveBeenCalledWith('stored-hash', 'password123test-pepper')
    expect(prismaMock.usuario.update).toHaveBeenCalledWith({
      where: { id: 10 },
      data: { ultimo_login: expect.any(Date) },
    })

    const decoded = jwt.verify(res.body.access_token, process.env.JWT_SECRET!) as jwt.JwtPayload
    expect(decoded).toMatchObject({
      sub: 10,
      role: roles.tecnico.id,
      roleCode: roles.tecnico.codigo,
      deleg: 1,
    })
  })

  it('rejects invalid credentials', async () => {
    prismaMock.usuario.findUnique.mockResolvedValue(null)

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'tecnico@example.com', password: 'password123' })
      .expect(401)

    expect(res.body).toEqual({ error: 'Credenciales inválidas' })
    expect(argon2Mock.verify).not.toHaveBeenCalled()
    expect(prismaMock.usuario.update).not.toHaveBeenCalled()
  })

  it('rejects inactive users', async () => {
    prismaMock.usuario.findUnique.mockResolvedValue({
      id: 10,
      password_hash: 'stored-hash',
      activo: false,
      bloqueado_en: null,
      rol_id: roles.tecnico.id,
      delegacion_id: 1,
      Rol: {
        codigo: roles.tecnico.codigo,
      },
    })

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'tecnico@example.com', password: 'password123' })
      .expect(401)

    expect(res.body).toEqual({ error: 'Credenciales inválidas' })
    expect(argon2Mock.verify).not.toHaveBeenCalled()
  })

  it('rejects blocked users', async () => {
    prismaMock.usuario.findUnique.mockResolvedValue({
      id: 10,
      password_hash: 'stored-hash',
      activo: true,
      bloqueado_en: new Date('2026-01-01T00:00:00.000Z'),
      rol_id: roles.tecnico.id,
      delegacion_id: 1,
      Rol: {
        codigo: roles.tecnico.codigo,
      },
    })

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'tecnico@example.com', password: 'password123' })
      .expect(401)

    expect(res.body).toEqual({ error: 'Credenciales inválidas' })
    expect(argon2Mock.verify).not.toHaveBeenCalled()
  })
})

describe('authRequired', () => {
  it('requires a bearer token', async () => {
    const res = await request(app).get('/api/usuarios/me').expect(401)

    expect(res.body).toEqual({ error: 'Token requerido' })
  })

  it('rejects invalid bearer tokens', async () => {
    const res = await request(app)
      .get('/api/usuarios/me')
      .set('Authorization', 'Bearer not-a-token')
      .expect(401)

    expect(res.body).toEqual({ error: 'Token inválido' })
  })

  it('loads the authenticated user without exposing password_hash', async () => {
    prismaMock.usuario.findUnique.mockResolvedValue({
      id: 10,
      nombre: 'Ada',
      apellidos: 'Lovelace',
      email: 'ada@example.com',
      delegacion_id: 1,
      rol_id: roles.tecnico.id,
      activo: true,
      requiere_reset: false,
      ultimo_login: null,
      password_actualizada_en: null,
      fecha_creacion: new Date('2026-01-01T00:00:00.000Z'),
      fecha_actualizacion: new Date('2026-01-01T00:00:00.000Z'),
    })

    const res = await request(app)
      .get('/api/usuarios/me')
      .set('Authorization', `Bearer ${authenticateAs(roles.tecnico)}`)
      .expect(200)

    expect(res.body).toMatchObject({
      id: 10,
      email: 'ada@example.com',
      rol_id: roles.tecnico.id,
    })
    expect(res.body).not.toHaveProperty('password_hash')
  })
})

describe('role authorization', () => {
  it('rejects admin-only routes for non-admin users', async () => {
    const res = await request(app)
      .get('/api/usuarios')
      .set('Authorization', `Bearer ${authenticateAs(roles.tecnico)}`)
      .expect(403)

    expect(res.body).toEqual({ error: 'Acción reservada a administradores' })
    expect(prismaMock.usuario.findMany).not.toHaveBeenCalled()
  })

  it('allows admin users on admin-only routes', async () => {
    prismaMock.usuario.findMany.mockResolvedValue([
      {
        id: 10,
        nombre: 'Ada',
        apellidos: 'Lovelace',
        email: 'ada@example.com',
        delegacion_id: 1,
        rol_id: roles.admin.id,
        activo: true,
        requiere_reset: false,
        ultimo_login: null,
        password_actualizada_en: null,
        fecha_creacion: new Date('2026-01-01T00:00:00.000Z'),
        fecha_actualizacion: new Date('2026-01-01T00:00:00.000Z'),
      },
    ])

    const res = await request(app)
      .get('/api/usuarios')
      .set('Authorization', `Bearer ${authenticateAs(roles.admin)}`)
      .expect(200)

    expect(res.body).toHaveLength(1)
    expect(res.body[0]).not.toHaveProperty('password_hash')
  })

  it('rejects supervisor-only guard routes for technicians', async () => {
    const res = await request(app)
      .get('/api/guardias/delegacion/1')
      .set('Authorization', `Bearer ${authenticateAs(roles.tecnico)}`)
      .expect(403)

    expect(res.body).toEqual({ error: 'No tienes permisos para realizar esta acción' })
    expect(prismaMock.guardia.findMany).not.toHaveBeenCalled()
  })

  it('allows supervisors to list guardias from their own delegation', async () => {
    prismaMock.guardia.findMany.mockResolvedValue([
      {
        id: 1,
        delegacion_id: 1,
        fecha_inicio: new Date('2026-06-01T08:00:00.000Z'),
        fecha_fin: new Date('2026-06-01T20:00:00.000Z'),
        estado: 'PLANIFICADA',
      },
    ])

    const res = await request(app)
      .get('/api/guardias/delegacion/1')
      .set('Authorization', `Bearer ${authenticateAs(roles.supervisor, 1)}`)
      .expect(200)

    expect(res.body).toHaveLength(1)
    expect(prismaMock.guardia.findMany).toHaveBeenCalledWith({
      where: { delegacion_id: 1 },
      orderBy: { fecha_inicio: 'asc' },
    })
  })

  it('rejects supervisors listing guardias from another delegation', async () => {
    const res = await request(app)
      .get('/api/guardias/delegacion/2')
      .set('Authorization', `Bearer ${authenticateAs(roles.supervisor, 1)}`)
      .expect(403)

    expect(res.body).toEqual({ error: 'No puedes ver guardias de otra delegación' })
    expect(prismaMock.guardia.findMany).not.toHaveBeenCalled()
  })

  it('allows admins to list guardias from another delegation', async () => {
    prismaMock.guardia.findMany.mockResolvedValue([])

    await request(app)
      .get('/api/guardias/delegacion/2')
      .set('Authorization', `Bearer ${authenticateAs(roles.admin, 1)}`)
      .expect(200)

    expect(prismaMock.guardia.findMany).toHaveBeenCalledWith({
      where: { delegacion_id: 2 },
      orderBy: { fecha_inicio: 'asc' },
    })
  })
})

describe('guardias', () => {
  it('creates a guardia with assignments atomically', async () => {
    const asignaciones = [
      { usuario_id: 10, rol_guardia_id: 1 },
      { usuario_id: 11, rol_guardia_id: 2 },
    ]
    const guardiaCreada = {
      id: 100,
      delegacion_id: 1,
      fecha_inicio: new Date('2026-06-01T08:00:00.000Z'),
      fecha_fin: new Date('2026-06-01T20:00:00.000Z'),
      estado: 'PLANIFICADA',
      creado_por: 20,
    }
    const tx = {
      guardia: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(guardiaCreada),
      },
      usuario: {
        findMany: vi.fn().mockResolvedValue([
          { id: 10, delegacion_id: 1, activo: true },
          { id: 11, delegacion_id: 1, activo: true },
        ]),
      },
      rolGuardia: { findMany: vi.fn().mockResolvedValue([{ id: 1 }, { id: 2 }]) },
      asignacionGuardia: {
        createMany: vi.fn().mockResolvedValue({ count: 2 }),
      },
    }

    prismaMock.guardia.findFirst.mockResolvedValue(null)
    prismaMock.usuario.findMany.mockResolvedValue([
      { id: 10, delegacion_id: 1 },
      { id: 11, delegacion_id: 1 },
    ])
    prismaMock.rolGuardia.findMany.mockResolvedValue([{ id: 1 }, { id: 2 }])
    prismaMock.$transaction.mockImplementation((callback: (txArg: typeof tx) => Promise<unknown>) =>
      callback(tx),
    )
    prismaMock.guardia.findUnique.mockResolvedValue({
      ...guardiaCreada,
      Delegacion: { id: 1, nombre: 'Madrid' },
      Asignaciones: [],
    })

    const res = await request(app)
      .post('/api/guardias')
      .set('Authorization', `Bearer ${authenticateAs(roles.supervisor, 1, 20)}`)
      .send({
        fecha_inicio: '2026-06-01T08:00:00.000Z',
        fecha_fin: '2026-06-01T20:00:00.000Z',
        asignaciones,
      })
      .expect(201)

    expect(res.body).toMatchObject({
      id: 100,
      delegacion_id: 1,
      estado: 'PLANIFICADA',
      creado_por: 20,
    })
    expect(tx.guardia.create).toHaveBeenCalledWith({
      data: {
        delegacion_id: 1,
        fecha_inicio: new Date('2026-06-01T08:00:00.000Z'),
        fecha_fin: new Date('2026-06-01T20:00:00.000Z'),
        estado: 'PLANIFICADA',
        creado_por: 20,
      },
    })
    expect(tx.asignacionGuardia.createMany).toHaveBeenCalledWith({
      data: [
        { guardia_id: 100, usuario_id: 10, rol_guardia_id: 1 },
        { guardia_id: 100, usuario_id: 11, rol_guardia_id: 2 },
      ],
    })
    expect(prismaMock.guardia.findFirst).not.toHaveBeenCalled()
    expect(prismaMock.usuario.findMany).not.toHaveBeenCalled()
    expect(prismaMock.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
    })
  })

  it('rejects overlapping guardias in the same delegation', async () => {
    prismaMock.guardia.findFirst.mockResolvedValue({
      id: 99,
      delegacion_id: 1,
    })

    const res = await request(app)
      .post('/api/guardias')
      .set('Authorization', `Bearer ${authenticateAs(roles.supervisor, 1, 20)}`)
      .send({
        fecha_inicio: '2026-06-01T08:00:00.000Z',
        fecha_fin: '2026-06-01T20:00:00.000Z',
      })
      .expect(400)

    expect(res.body).toEqual({ error: 'Ya existe una guardia solapada en esta delegación' })
    expect(prismaMock.guardia.create).not.toHaveBeenCalled()
  })

  it('rejects assignments for users from another delegation', async () => {
    prismaMock.guardia.findFirst.mockResolvedValue(null)
    prismaMock.usuario.findMany.mockResolvedValue([{ id: 10, delegacion_id: 2 }])

    const res = await request(app)
      .post('/api/guardias')
      .set('Authorization', `Bearer ${authenticateAs(roles.supervisor, 1, 20)}`)
      .send({
        fecha_inicio: '2026-06-01T08:00:00.000Z',
        fecha_fin: '2026-06-01T20:00:00.000Z',
        asignaciones: [{ usuario_id: 10, rol_guardia_id: 1 }],
      })
      .expect(400)

    expect(res.body).toEqual({
      error: 'Todos los usuarios asignados deben pertenecer a la misma delegación que la guardia',
    })
    expect(prismaMock.guardia.create).not.toHaveBeenCalled()
  })

  it('rejects duplicated guard roles in a guardia', async () => {
    prismaMock.guardia.findFirst.mockResolvedValue(null)

    const res = await request(app)
      .post('/api/guardias')
      .set('Authorization', `Bearer ${authenticateAs(roles.supervisor, 1, 20)}`)
      .send({
        fecha_inicio: '2026-06-01T08:00:00.000Z',
        fecha_fin: '2026-06-01T20:00:00.000Z',
        asignaciones: [
          { usuario_id: 10, rol_guardia_id: 1 },
          { usuario_id: 11, rol_guardia_id: 1 },
        ],
      })
      .expect(400)

    expect(res.body).toEqual({ error: 'No se puede repetir un rol de guardia en la misma guardia' })
    expect(prismaMock.usuario.findMany).not.toHaveBeenCalled()
    expect(prismaMock.guardia.create).not.toHaveBeenCalled()
  })
})

describe('permisos', () => {
  it('allows a technician to request a permiso in pending state', async () => {
    prismaMock.tipoPermiso.findUnique.mockResolvedValue({
      id: 1,
      codigo: 'VACACIONES',
      nombre: 'Vacaciones',
    })
    prismaMock.estadoPermiso.findUnique.mockResolvedValue({
      id: 1,
      codigo: 'PENDIENTE',
      nombre: 'Pendiente',
    })
    prismaMock.permiso.create.mockResolvedValue({
      id: 50,
      usuario_id: 10,
      tipo_id: 1,
      estado_id: 1,
      fecha_inicio: new Date('2026-07-01T00:00:00.000Z'),
      fecha_fin: new Date('2026-07-05T00:00:00.000Z'),
      creado_por: 10,
      Tipo: { id: 1, codigo: 'VACACIONES', nombre: 'Vacaciones' },
      Estado: { id: 1, codigo: 'PENDIENTE', nombre: 'Pendiente' },
    })

    const res = await request(app)
      .post('/api/permisos')
      .set('Authorization', `Bearer ${authenticateAs(roles.tecnico, 1, 10)}`)
      .send({
        tipo_id: 1,
        fecha_inicio: '2026-07-01',
        fecha_fin: '2026-07-05',
        observaciones: 'Verano',
      })
      .expect(201)

    expect(res.body).toMatchObject({
      id: 50,
      usuario_id: 10,
      creado_por: 10,
      Estado: {
        codigo: 'PENDIENTE',
      },
    })
    expect(prismaMock.permiso.create).toHaveBeenCalledWith({
      data: {
        usuario_id: 10,
        tipo_id: 1,
        estado_id: 1,
        fecha_inicio: new Date('2026-07-01'),
        fecha_fin: new Date('2026-07-05'),
        observaciones: 'Verano',
        creado_por: 10,
      },
      include: {
        Tipo: true,
        Estado: true,
      },
    })
  })

  it('allows a supervisor to decide a pending permiso from their delegation', async () => {
    prismaMock.permiso.findUnique.mockResolvedValue({
      id: 50,
      estado_id: 1,
      observaciones: 'Original',
      Estado: {
        codigo: 'PENDIENTE',
      },
      Usuario: {
        delegacion_id: 1,
      },
    })
    prismaMock.estadoPermiso.findUnique.mockResolvedValue({
      id: 2,
      codigo: 'APROBADO',
      nombre: 'Aprobado',
    })
    prismaMock.permiso.update.mockResolvedValue({
      id: 50,
      estado_id: 2,
      decidido_por: 20,
      Estado: {
        codigo: 'APROBADO',
      },
      Tipo: {
        codigo: 'VACACIONES',
      },
    })

    const res = await request(app)
      .patch('/api/permisos/50/decidir')
      .set('Authorization', `Bearer ${authenticateAs(roles.supervisor, 1, 20)}`)
      .send({
        estado_id: 2,
        observaciones: 'Aprobado',
      })
      .expect(200)

    expect(res.body).toMatchObject({
      id: 50,
      estado_id: 2,
      decidido_por: 20,
      Estado: {
        codigo: 'APROBADO',
      },
    })
    expect(prismaMock.permiso.update).toHaveBeenCalledWith({
      where: { id: 50, estado_id: 1, Usuario: { delegacion_id: 1 } },
      data: {
        estado_id: 2,
        decidido_por: 20,
        observaciones: 'Aprobado',
      },
      include: {
        Tipo: true,
        Estado: true,
      },
    })
  })

  it('rejects supervisors deciding permisos from another delegation', async () => {
    prismaMock.permiso.findUnique.mockResolvedValue({
      id: 50,
      Estado: {
        codigo: 'PENDIENTE',
      },
      Usuario: {
        delegacion_id: 2,
      },
    })

    const res = await request(app)
      .patch('/api/permisos/50/decidir')
      .set('Authorization', `Bearer ${authenticateAs(roles.supervisor, 1, 20)}`)
      .send({
        estado_id: 2,
      })
      .expect(403)

    expect(res.body).toEqual({ error: 'No puedes decidir permisos de otra delegación' })
    expect(prismaMock.estadoPermiso.findUnique).not.toHaveBeenCalled()
    expect(prismaMock.permiso.update).not.toHaveBeenCalled()
  })
})

describe('admin catalog routes', () => {
  it('requires admin role to list delegaciones', async () => {
    const res = await request(app)
      .get('/api/delegaciones')
      .set('Authorization', `Bearer ${authenticateAs(roles.supervisor)}`)
      .expect(403)

    expect(res.body).toEqual({ error: 'Acción reservada a administradores' })
    expect(prismaMock.delegacion.findMany).not.toHaveBeenCalled()
  })

  it('allows admins to list delegaciones', async () => {
    prismaMock.delegacion.findMany.mockResolvedValue([
      {
        id: 1,
        nombre: 'Madrid',
        codigo: 'MAD',
        activo: true,
      },
    ])

    const res = await request(app)
      .get('/api/delegaciones')
      .set('Authorization', `Bearer ${authenticateAs(roles.admin)}`)
      .expect(200)

    expect(res.body).toHaveLength(1)
    expect(prismaMock.delegacion.findMany).toHaveBeenCalledWith({
      orderBy: { nombre: 'asc' },
    })
  })

  it('requires admin role to list user roles', async () => {
    const res = await request(app)
      .get('/api/rolesUsuario')
      .set('Authorization', `Bearer ${authenticateAs(roles.tecnico)}`)
      .expect(403)

    expect(res.body).toEqual({ error: 'Acción reservada a administradores' })
    expect(prismaMock.rolUsuario.findMany).not.toHaveBeenCalled()
  })

  it('allows admins to list user roles', async () => {
    prismaMock.rolUsuario.findMany.mockResolvedValue(Object.values(roles))

    const res = await request(app)
      .get('/api/rolesUsuario')
      .set('Authorization', `Bearer ${authenticateAs(roles.admin)}`)
      .expect(200)

    expect(res.body).toHaveLength(3)
    expect(prismaMock.rolUsuario.findMany).toHaveBeenCalledWith({
      orderBy: { nombre: 'asc' },
    })
  })
})

describe('equipos', () => {
  it('lists only supervisor delegation teams even if another delegation is requested', async () => {
    prismaMock.equipo.findMany.mockResolvedValue([
      {
        id: 1,
        nombre_equipo: 'N1',
        delegacion_id: 1,
      },
    ])

    const res = await request(app)
      .get('/api/equipos?delegacion_id=2')
      .set('Authorization', `Bearer ${authenticateAs(roles.supervisor, 1, 20)}`)
      .expect(200)

    expect(res.body).toHaveLength(1)
    expect(prismaMock.equipo.findMany).toHaveBeenCalledWith({
      where: { delegacion_id: 1 },
      orderBy: { nombre_equipo: 'asc' },
    })
  })

  it('allows admins to filter teams by delegation', async () => {
    prismaMock.equipo.findMany.mockResolvedValue([
      {
        id: 2,
        nombre_equipo: 'N2',
        delegacion_id: 2,
      },
    ])

    const res = await request(app)
      .get('/api/equipos?delegacion_id=2')
      .set('Authorization', `Bearer ${authenticateAs(roles.admin, 1, 30)}`)
      .expect(200)

    expect(res.body).toHaveLength(1)
    expect(prismaMock.equipo.findMany).toHaveBeenCalledWith({
      where: { delegacion_id: 2 },
      orderBy: { nombre_equipo: 'asc' },
    })
  })

  it('rejects supervisors reading teams from another delegation', async () => {
    prismaMock.equipo.findUnique.mockResolvedValue({
      id: 2,
      nombre_equipo: 'N2',
      delegacion_id: 2,
      Miembros: [],
    })

    const res = await request(app)
      .get('/api/equipos/2')
      .set('Authorization', `Bearer ${authenticateAs(roles.supervisor, 1, 20)}`)
      .expect(403)

    expect(res.body).toEqual({ error: 'No puedes consultar equipos de otra delegación' })
  })

  it('allows supervisors to add members to teams in their delegation', async () => {
    prismaMock.equipo.findUnique.mockResolvedValue({
      id: 1,
      nombre_equipo: 'N1',
      delegacion_id: 1,
    })
    prismaMock.usuario.findUnique.mockResolvedValue({
      id: 10,
      delegacion_id: 1,
    })
    prismaMock.miembroEquipo.create.mockResolvedValue({
      equipo_id: 1,
      usuario_id: 10,
    })

    const res = await request(app)
      .post('/api/equipos/1/miembros')
      .set('Authorization', `Bearer ${authenticateAs(roles.supervisor, 1, 20)}`)
      .send({ usuario_id: 10 })
      .expect(201)

    expect(res.body).toEqual({
      equipo_id: 1,
      usuario_id: 10,
    })
    expect(prismaMock.miembroEquipo.create).toHaveBeenCalledWith({
      data: {
        equipo_id: 1,
        usuario_id: 10,
      },
    })
  })

  it('rejects adding users from another delegation to a team', async () => {
    prismaMock.equipo.findUnique.mockResolvedValue({
      id: 1,
      nombre_equipo: 'N1',
      delegacion_id: 1,
    })
    prismaMock.usuario.findUnique.mockResolvedValue({
      id: 10,
      delegacion_id: 2,
    })

    const res = await request(app)
      .post('/api/equipos/1/miembros')
      .set('Authorization', `Bearer ${authenticateAs(roles.supervisor, 1, 20)}`)
      .send({ usuario_id: 10 })
      .expect(400)

    expect(res.body).toEqual({
      error: 'Usuario y equipo deben pertenecer a la misma delegación',
    })
    expect(prismaMock.miembroEquipo.create).not.toHaveBeenCalled()
  })
})

describe('admin catalog mutations', () => {
  it('allows admins to create delegaciones', async () => {
    prismaMock.delegacion.create.mockResolvedValue({
      id: 2,
      nombre: 'Barcelona',
      codigo: 'BCN',
      pais_code: 'ES',
      region_code: 'CAT',
      activo: true,
    })

    const res = await request(app)
      .post('/api/delegaciones')
      .set('Authorization', `Bearer ${authenticateAs(roles.admin)}`)
      .send({
        nombre: 'Barcelona',
        codigo: 'BCN',
        pais_code: 'ES',
        region_code: 'CAT',
      })
      .expect(201)

    expect(res.body).toMatchObject({
      id: 2,
      nombre: 'Barcelona',
      codigo: 'BCN',
      activo: true,
    })
    expect(prismaMock.delegacion.create).toHaveBeenCalledWith({
      data: {
        nombre: 'Barcelona',
        codigo: 'BCN',
        pais_code: 'ES',
        region_code: 'CAT',
        activo: true,
      },
    })
  })

  it('requires admin role to update delegaciones', async () => {
    const res = await request(app)
      .patch('/api/delegaciones/2')
      .set('Authorization', `Bearer ${authenticateAs(roles.supervisor)}`)
      .send({ activo: false })
      .expect(403)

    expect(res.body).toEqual({ error: 'Acción reservada a administradores' })
    expect(prismaMock.delegacion.update).not.toHaveBeenCalled()
  })

  it('allows admins to update user roles', async () => {
    prismaMock.rolUsuario.update.mockResolvedValue({
      id: roles.supervisor.id,
      codigo: 'SUPERVISOR',
      nombre: 'Supervisor actualizado',
    })

    const res = await request(app)
      .patch(`/api/rolesUsuario/${roles.supervisor.id}`)
      .set('Authorization', `Bearer ${authenticateAs(roles.admin)}`)
      .send({ nombre: 'Supervisor actualizado' })
      .expect(200)

    expect(res.body).toEqual({
      id: roles.supervisor.id,
      codigo: 'SUPERVISOR',
      nombre: 'Supervisor actualizado',
    })
    expect(prismaMock.rolUsuario.update).toHaveBeenCalledWith({
      where: { id: roles.supervisor.id },
      data: { nombre: 'Supervisor actualizado' },
    })
  })

  it('allows admins to create equipos for existing delegaciones', async () => {
    prismaMock.delegacion.findUnique.mockResolvedValue({
      id: 1,
      nombre: 'Madrid',
    })
    prismaMock.equipo.create.mockResolvedValue({
      id: 1,
      nombre_equipo: 'Nivel 1',
      delegacion_id: 1,
    })

    const res = await request(app)
      .post('/api/equipos')
      .set('Authorization', `Bearer ${authenticateAs(roles.admin)}`)
      .send({
        nombre_equipo: 'Nivel 1',
        delegacion_id: 1,
      })
      .expect(201)

    expect(res.body).toEqual({
      id: 1,
      nombre_equipo: 'Nivel 1',
      delegacion_id: 1,
    })
    expect(prismaMock.equipo.create).toHaveBeenCalledWith({
      data: {
        nombre_equipo: 'Nivel 1',
        delegacion_id: 1,
      },
    })
  })

  it('rejects creating equipos for unknown delegaciones', async () => {
    prismaMock.delegacion.findUnique.mockResolvedValue(null)

    const res = await request(app)
      .post('/api/equipos')
      .set('Authorization', `Bearer ${authenticateAs(roles.admin)}`)
      .send({
        nombre_equipo: 'Nivel 1',
        delegacion_id: 99,
      })
      .expect(400)

    expect(res.body).toEqual({ error: 'Delegación no encontrada: 99' })
    expect(prismaMock.equipo.create).not.toHaveBeenCalled()
  })

  it('requires admin role to update equipos', async () => {
    const res = await request(app)
      .patch('/api/equipos/1')
      .set('Authorization', `Bearer ${authenticateAs(roles.supervisor)}`)
      .send({ nombre_equipo: 'Nivel 2' })
      .expect(403)

    expect(res.body).toEqual({ error: 'Acción reservada a administradores' })
    expect(prismaMock.equipo.update).not.toHaveBeenCalled()
  })
})

describe('permisos edge cases', () => {
  it('rejects deciding permisos that are no longer pending', async () => {
    prismaMock.permiso.findUnique.mockResolvedValue({
      id: 50,
      Estado: {
        codigo: 'APROBADO',
      },
      Usuario: {
        delegacion_id: 1,
      },
    })

    const res = await request(app)
      .patch('/api/permisos/50/decidir')
      .set('Authorization', `Bearer ${authenticateAs(roles.supervisor, 1, 20)}`)
      .send({ estado_id: 2 })
      .expect(400)

    expect(res.body).toEqual({
      error: 'No se puede cambiar un permiso en estado APROBADO',
    })
    expect(prismaMock.estadoPermiso.findUnique).not.toHaveBeenCalled()
    expect(prismaMock.permiso.update).not.toHaveBeenCalled()
  })

  it('rejects putting a permiso back into pending state', async () => {
    prismaMock.permiso.findUnique.mockResolvedValue({
      id: 50,
      Estado: {
        codigo: 'PENDIENTE',
      },
      Usuario: {
        delegacion_id: 1,
      },
    })
    prismaMock.estadoPermiso.findUnique.mockResolvedValue({
      id: 1,
      codigo: 'PENDIENTE',
      nombre: 'Pendiente',
    })

    const res = await request(app)
      .patch('/api/permisos/50/decidir')
      .set('Authorization', `Bearer ${authenticateAs(roles.supervisor, 1, 20)}`)
      .send({ estado_id: 1 })
      .expect(400)

    expect(res.body).toEqual({
      error: 'No se puede volver a poner el permiso en estado PENDIENTE',
    })
    expect(prismaMock.permiso.update).not.toHaveBeenCalled()
  })

  it('rejects unknown permiso decision states', async () => {
    prismaMock.permiso.findUnique.mockResolvedValue({
      id: 50,
      Estado: {
        codigo: 'PENDIENTE',
      },
      Usuario: {
        delegacion_id: 1,
      },
    })
    prismaMock.estadoPermiso.findUnique.mockResolvedValue(null)

    const res = await request(app)
      .patch('/api/permisos/50/decidir')
      .set('Authorization', `Bearer ${authenticateAs(roles.supervisor, 1, 20)}`)
      .send({ estado_id: 99 })
      .expect(400)

    expect(res.body).toEqual({
      error: 'Estado de permiso no válido: 99',
    })
    expect(prismaMock.permiso.update).not.toHaveBeenCalled()
  })
})

describe('team members and team permissions', () => {
  it('allows supervisors to remove members from teams in their delegation', async () => {
    prismaMock.equipo.findUnique.mockResolvedValue({
      id: 1,
      nombre_equipo: 'N1',
      delegacion_id: 1,
    })
    prismaMock.miembroEquipo.delete.mockResolvedValue({
      equipo_id: 1,
      usuario_id: 10,
    })

    await request(app)
      .delete('/api/equipos/1/miembros/10')
      .set('Authorization', `Bearer ${authenticateAs(roles.supervisor, 1, 20)}`)
      .expect(204)

    expect(prismaMock.miembroEquipo.delete).toHaveBeenCalledWith({
      where: {
        equipo_id_usuario_id: {
          equipo_id: 1,
          usuario_id: 10,
        },
      },
    })
  })

  it('rejects supervisors removing members from teams in another delegation', async () => {
    prismaMock.equipo.findUnique.mockResolvedValue({
      id: 2,
      nombre_equipo: 'N2',
      delegacion_id: 2,
    })

    const res = await request(app)
      .delete('/api/equipos/2/miembros/10')
      .set('Authorization', `Bearer ${authenticateAs(roles.supervisor, 1, 20)}`)
      .expect(403)

    expect(res.body).toEqual({ error: 'No puedes modificar equipos de otra delegación' })
    expect(prismaMock.miembroEquipo.delete).not.toHaveBeenCalled()
  })

  it('returns empty permissions for teams without members', async () => {
    prismaMock.equipo.findUnique.mockResolvedValue({
      id: 1,
      nombre_equipo: 'N1',
      delegacion_id: 1,
    })
    prismaMock.miembroEquipo.findMany.mockResolvedValue([])

    const res = await request(app)
      .get('/api/equipos/1/permisos')
      .set('Authorization', `Bearer ${authenticateAs(roles.supervisor, 1, 20)}`)
      .expect(200)

    expect(res.body).toEqual([])
    expect(prismaMock.permiso.findMany).not.toHaveBeenCalled()
  })

  it('lists team permissions for team members with year filtering', async () => {
    prismaMock.equipo.findUnique.mockResolvedValue({
      id: 1,
      nombre_equipo: 'N1',
      delegacion_id: 1,
    })
    prismaMock.miembroEquipo.findMany.mockResolvedValue([{ usuario_id: 10 }, { usuario_id: 11 }])
    prismaMock.permiso.findMany.mockResolvedValue([
      {
        id: 50,
        usuario_id: 10,
        fecha_inicio: new Date('2026-07-01T00:00:00.000Z'),
        fecha_fin: new Date('2026-07-05T00:00:00.000Z'),
        Usuario: {
          id: 10,
          nombre: 'Ada',
          apellidos: 'Lovelace',
          email: 'ada@example.com',
          delegacion_id: 1,
          activo: true,
        },
        Tipo: {
          codigo: 'VACACIONES',
        },
        Estado: {
          codigo: 'PENDIENTE',
        },
      },
    ])

    const res = await request(app)
      .get('/api/equipos/1/permisos?anio=2026')
      .set('Authorization', `Bearer ${authenticateAs(roles.supervisor, 1, 20)}`)
      .expect(200)

    expect(res.body).toHaveLength(1)
    expect(prismaMock.permiso.findMany).toHaveBeenCalledWith({
      where: {
        usuario_id: { in: [10, 11] },
        Usuario: { delegacion_id: 1 },
        fecha_inicio: {
          lte: new Date('2026-12-31T00:00:00.000Z'),
        },
        fecha_fin: { gte: new Date('2026-01-01T00:00:00.000Z') },
      },
      include: {
        Usuario: {
          select: {
            id: true,
            nombre: true,
            apellidos: true,
            email: true,
            delegacion_id: true,
            activo: true,
          },
        },
        Tipo: true,
        Estado: true,
      },
      orderBy: { fecha_inicio: 'desc' },
    })
  })

  it('rejects supervisors listing team permissions from another delegation', async () => {
    prismaMock.equipo.findUnique.mockResolvedValue({
      id: 2,
      nombre_equipo: 'N2',
      delegacion_id: 2,
    })

    const res = await request(app)
      .get('/api/equipos/2/permisos')
      .set('Authorization', `Bearer ${authenticateAs(roles.supervisor, 1, 20)}`)
      .expect(403)

    expect(res.body).toEqual({ error: 'No puedes consultar equipos de otra delegación' })
    expect(prismaMock.miembroEquipo.findMany).not.toHaveBeenCalled()
    expect(prismaMock.permiso.findMany).not.toHaveBeenCalled()
  })
})

describe('permiso request edge cases', () => {
  it('rejects permiso requests with unknown types', async () => {
    prismaMock.tipoPermiso.findUnique.mockResolvedValue(null)

    const res = await request(app)
      .post('/api/permisos')
      .set('Authorization', `Bearer ${authenticateAs(roles.tecnico, 1, 10)}`)
      .send({
        tipo_id: 99,
        fecha_inicio: '2026-07-01',
        fecha_fin: '2026-07-05',
      })
      .expect(400)

    expect(res.body).toEqual({ error: 'Tipo de permiso no válido: 99' })
    expect(prismaMock.estadoPermiso.findUnique).not.toHaveBeenCalled()
    expect(prismaMock.permiso.create).not.toHaveBeenCalled()
  })

  it('returns not found when deciding a missing permiso', async () => {
    prismaMock.permiso.findUnique.mockResolvedValue(null)

    const res = await request(app)
      .patch('/api/permisos/999/decidir')
      .set('Authorization', `Bearer ${authenticateAs(roles.supervisor, 1, 20)}`)
      .send({ estado_id: 2 })
      .expect(404)

    expect(res.body).toEqual({ error: 'Permiso no encontrado' })
    expect(prismaMock.estadoPermiso.findUnique).not.toHaveBeenCalled()
    expect(prismaMock.permiso.update).not.toHaveBeenCalled()
  })
})
