import request from 'supertest'
import * as jwt from 'jsonwebtoken'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { app } from '../src/app'

const prismaMock = vi.hoisted(() => ({
  usuario: {
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
    findMany: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
  },
  asignacionGuardia: {
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

function signToken(role: (typeof roles)[keyof typeof roles], deleg = 1, sub = 10) {
  return jwt.sign(
    {
      sub,
      role: role.id,
      roleCode: role.codigo,
      deleg,
    },
    process.env.JWT_SECRET!,
    { expiresIn: '15m' },
  )
}

function mockRoleLookup() {
  prismaMock.rolUsuario.findUnique.mockImplementation(
    ({ where }: { where: { id: number } }) =>
      Promise.resolve(Object.values(roles).find((role) => role.id === where.id) ?? null),
  )
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  mockRoleLookup()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('auth login', () => {
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
      .set('Authorization', `Bearer ${signToken(roles.tecnico)}`)
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
      .set('Authorization', `Bearer ${signToken(roles.tecnico)}`)
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
      .set('Authorization', `Bearer ${signToken(roles.admin)}`)
      .expect(200)

    expect(res.body).toHaveLength(1)
    expect(res.body[0]).not.toHaveProperty('password_hash')
  })

  it('rejects supervisor-only guard routes for technicians', async () => {
    const res = await request(app)
      .get('/api/guardias/delegacion/1')
      .set('Authorization', `Bearer ${signToken(roles.tecnico)}`)
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
      .set('Authorization', `Bearer ${signToken(roles.supervisor, 1)}`)
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
      .set('Authorization', `Bearer ${signToken(roles.supervisor, 1)}`)
      .expect(403)

    expect(res.body).toEqual({ error: 'No puedes ver guardias de otra delegación' })
    expect(prismaMock.guardia.findMany).not.toHaveBeenCalled()
  })

  it('allows admins to list guardias from another delegation', async () => {
    prismaMock.guardia.findMany.mockResolvedValue([])

    await request(app)
      .get('/api/guardias/delegacion/2')
      .set('Authorization', `Bearer ${signToken(roles.admin, 1)}`)
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
        create: vi.fn().mockResolvedValue(guardiaCreada),
      },
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
      .set('Authorization', `Bearer ${signToken(roles.supervisor, 1, 20)}`)
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
  })

  it('rejects overlapping guardias in the same delegation', async () => {
    prismaMock.guardia.findFirst.mockResolvedValue({
      id: 99,
      delegacion_id: 1,
    })

    const res = await request(app)
      .post('/api/guardias')
      .set('Authorization', `Bearer ${signToken(roles.supervisor, 1, 20)}`)
      .send({
        fecha_inicio: '2026-06-01T08:00:00.000Z',
        fecha_fin: '2026-06-01T20:00:00.000Z',
      })
      .expect(400)

    expect(res.body).toEqual({ error: 'Ya existe una guardia solapada en esta delegación' })
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
  })

  it('rejects assignments for users from another delegation', async () => {
    prismaMock.guardia.findFirst.mockResolvedValue(null)
    prismaMock.usuario.findMany.mockResolvedValue([{ id: 10, delegacion_id: 2 }])

    const res = await request(app)
      .post('/api/guardias')
      .set('Authorization', `Bearer ${signToken(roles.supervisor, 1, 20)}`)
      .send({
        fecha_inicio: '2026-06-01T08:00:00.000Z',
        fecha_fin: '2026-06-01T20:00:00.000Z',
        asignaciones: [{ usuario_id: 10, rol_guardia_id: 1 }],
      })
      .expect(400)

    expect(res.body).toEqual({
      error: 'Todos los usuarios asignados deben pertenecer a la misma delegación que la guardia',
    })
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
  })

  it('rejects duplicated guard roles in a guardia', async () => {
    prismaMock.guardia.findFirst.mockResolvedValue(null)

    const res = await request(app)
      .post('/api/guardias')
      .set('Authorization', `Bearer ${signToken(roles.supervisor, 1, 20)}`)
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
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
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
      .set('Authorization', `Bearer ${signToken(roles.tecnico, 1, 10)}`)
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
      .set('Authorization', `Bearer ${signToken(roles.supervisor, 1, 20)}`)
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
      where: { id: 50 },
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
      .set('Authorization', `Bearer ${signToken(roles.supervisor, 1, 20)}`)
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
      .set('Authorization', `Bearer ${signToken(roles.supervisor)}`)
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
      .set('Authorization', `Bearer ${signToken(roles.admin)}`)
      .expect(200)

    expect(res.body).toHaveLength(1)
    expect(prismaMock.delegacion.findMany).toHaveBeenCalledWith({
      orderBy: { nombre: 'asc' },
    })
  })

  it('requires admin role to list user roles', async () => {
    const res = await request(app)
      .get('/api/rolesUsuario')
      .set('Authorization', `Bearer ${signToken(roles.tecnico)}`)
      .expect(403)

    expect(res.body).toEqual({ error: 'Acción reservada a administradores' })
    expect(prismaMock.rolUsuario.findMany).not.toHaveBeenCalled()
  })

  it('allows admins to list user roles', async () => {
    prismaMock.rolUsuario.findMany.mockResolvedValue(Object.values(roles))

    const res = await request(app)
      .get('/api/rolesUsuario')
      .set('Authorization', `Bearer ${signToken(roles.admin)}`)
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
      .set('Authorization', `Bearer ${signToken(roles.supervisor, 1, 20)}`)
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
      .set('Authorization', `Bearer ${signToken(roles.admin, 1, 30)}`)
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
      .set('Authorization', `Bearer ${signToken(roles.supervisor, 1, 20)}`)
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
      .set('Authorization', `Bearer ${signToken(roles.supervisor, 1, 20)}`)
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
      .set('Authorization', `Bearer ${signToken(roles.supervisor, 1, 20)}`)
      .send({ usuario_id: 10 })
      .expect(400)

    expect(res.body).toEqual({
      error: 'Usuario y equipo deben pertenecer a la misma delegación',
    })
    expect(prismaMock.miembroEquipo.create).not.toHaveBeenCalled()
  })
})
