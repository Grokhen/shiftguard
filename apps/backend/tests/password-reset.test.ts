import request from 'supertest'
import * as jwt from 'jsonwebtoken'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { app } from '../src/app'

const db = vi.hoisted(() => ({
  usuario: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
  },
  $transaction: vi.fn(),
}))
const argon = vi.hoisted(() => ({ hash: vi.fn(), verify: vi.fn() }))
vi.mock('../src/prisma', () => ({ prisma: db }))
vi.mock('argon2', () => ({ default: argon, ...argon }))

function account(roleCode = 'TECNICO') {
  return {
    id: 10,
    rol_id: roleCode === 'ADMIN' ? 3 : roleCode === 'SUPERVISOR' ? 2 : 1,
    delegacion_id: 1,
    Rol: { codigo: roleCode },
    email: 'reset@example.com',
    activo: true,
    bloqueado_en: null as Date | null,
    password_hash: 'old-hash',
    password_actualizada_en: null as Date | null,
    requiere_reset: true,
  }
}

function tokenFor(user: ReturnType<typeof account>, requiresPasswordChange?: boolean) {
  return jwt.sign(
    {
      sub: user.id,
      role: user.rol_id,
      roleCode: user.Rol.codigo,
      deleg: user.delegacion_id,
      passwordVersion: user.password_actualizada_en?.getTime() ?? 0,
      requiresPasswordChange,
    },
    process.env.JWT_SECRET!,
    { expiresIn: '15m' },
  )
}

function useAccount(user = account()) {
  db.usuario.findFirst.mockImplementation(async () =>
    user.activo && !user.bloqueado_en ? { ...user } : null,
  )
  db.usuario.findUnique.mockImplementation(async ({ select }) =>
    select
      ? Object.fromEntries(Object.keys(select).map((key) => [key, user[key as keyof typeof user]]))
      : { ...user },
  )
  db.usuario.updateMany.mockImplementation(async ({ where, data }) => {
    if (where.id !== user.id || where.password_hash !== user.password_hash) return { count: 0 }
    Object.assign(user, data)
    return { count: 1 }
  })
  db.usuario.update.mockImplementation(async ({ data }) => Object.assign(user, data))
  db.usuario.findMany.mockResolvedValue([])
  return user
}

beforeEach(() => {
  vi.resetAllMocks()
  argon.verify.mockImplementation(
    async (hash, value) =>
      value === `${hash === 'old-hash' ? 'old-password' : 'new-password'}test-pepper`,
  )
  argon.hash.mockResolvedValue('new-hash')
  db.$transaction.mockImplementation((work) => work(db))
})

describe('mandatory password changes', () => {
  it.each(['TECNICO', 'SUPERVISOR', 'ADMIN'])(
    'issues a restricted session for %s and accepts a new login after changing the password',
    async (role) => {
      const user = useAccount(account(role))
      const login = await request(app)
        .post('/api/auth/login')
        .send({ email: user.email, password: 'old-password' })
        .expect(200)
      const token = login.body.access_token
      expect(jwt.verify(token, process.env.JWT_SECRET!)).toMatchObject({
        requiresPasswordChange: true,
      })
      await request(app).get('/api/usuarios').set('Authorization', `Bearer ${token}`).expect(403)
      const me = await request(app)
        .get('/api/usuarios/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200)
      expect(me.body.requiere_reset).toBe(true)
      expect(me.body).not.toHaveProperty('password_hash')

      await request(app)
        .patch('/api/usuarios/me/password')
        .set('Authorization', `Bearer ${token}`)
        .send({ password_actual: 'old-password', password_nueva: 'new-password' })
        .expect(204)
      expect(user.requiere_reset).toBe(false)
      expect(user.password_hash).toBe('new-hash')
      expect(user.password_actualizada_en).toBeInstanceOf(Date)
      await request(app).get('/api/usuarios/me').set('Authorization', `Bearer ${token}`).expect(401)
      const fresh = await request(app)
        .post('/api/auth/login')
        .send({ email: user.email, password: 'new-password' })
        .expect(200)
      expect(jwt.verify(fresh.body.access_token, process.env.JWT_SECRET!)).toMatchObject({
        requiresPasswordChange: false,
      })
      await request(app)
        .get('/api/usuarios/me')
        .set('Authorization', `Bearer ${fresh.body.access_token}`)
        .expect(200)
    },
  )

  it.each([
    ['GET', '/api/guardias'],
    ['GET', '/api/permisos'],
    ['GET', '/api/equipos'],
    ['GET', '/api/delegaciones'],
    ['GET', '/api/rolesUsuario'],
    ['GET', '/api/usuarios'],
    ['PATCH', '/api/usuarios/me'],
    ['PATCH', '/api/usuarios/10'],
    ['POST', '/api/usuarios'],
    ['POST', '/api/guardias'],
    ['POST', '/api/permisos'],
    ['DELETE', '/api/equipos/1/miembros/10'],
  ])('blocks %s %s even for an administrator', async (method, path) => {
    const user = useAccount(account('ADMIN'))
    const agent = request(app)
    const operation =
      method === 'GET'
        ? agent.get(path)
        : method === 'PATCH'
          ? agent.patch(path)
          : method === 'POST'
            ? agent.post(path)
            : agent.delete(path)
    const response = await operation
      .set('Authorization', `Bearer ${tokenFor(user, false)}`)
      .send({ requiere_reset: false })
      .expect(403)
    expect(response.body.code).toBe('PASSWORD_CHANGE_REQUIRED')
    expect(db.usuario.findUnique).not.toHaveBeenCalled()
    expect(db.usuario.update).not.toHaveBeenCalled()
    expect(db.$transaction).not.toHaveBeenCalled()
  })

  it('enforces a reset activated after login even when the token has no reset claim', async () => {
    const user = useAccount({ ...account('ADMIN'), requiere_reset: false })
    const token = tokenFor(user)
    await request(app).get('/api/usuarios').set('Authorization', `Bearer ${token}`).expect(200)
    user.requiere_reset = true
    const response = await request(app)
      .get('/api/usuarios')
      .set('Authorization', `Bearer ${token}`)
      .expect(403)
    expect(response.body.code).toBe('PASSWORD_CHANGE_REQUIRED')
    expect(db.usuario.findMany).toHaveBeenCalledTimes(1)
  })

  it.each(['incorrect-password', 'old-password'])(
    'preserves the reset requirement on an invalid change: %s',
    async (current) => {
      const user = useAccount()
      await request(app)
        .patch('/api/usuarios/me/password')
        .set('Authorization', `Bearer ${tokenFor(user)}`)
        .send({
          password_actual: current,
          password_nueva: current === 'old-password' ? current : 'new-password',
        })
        .expect(400)
      expect(user.requiere_reset).toBe(true)
      expect(db.usuario.updateMany).not.toHaveBeenCalled()
      expect(argon.hash).not.toHaveBeenCalled()
    },
  )

  it('does not clear the requirement when another password change wins the race', async () => {
    const user = useAccount()
    db.usuario.updateMany.mockResolvedValue({ count: 0 })
    await request(app)
      .patch('/api/usuarios/me/password')
      .set('Authorization', `Bearer ${tokenFor(user)}`)
      .send({ password_actual: 'old-password', password_nueva: 'new-password' })
      .expect(409)
    expect(user.requiere_reset).toBe(true)
  })

  it.each(['inactive', 'blocked'])(
    'denies password recovery routes for an %s account',
    async (state) => {
      const user = useAccount()
      if (state === 'inactive') user.activo = false
      else user.bloqueado_en = new Date()
      await request(app)
        .get('/api/usuarios/me')
        .set('Authorization', `Bearer ${tokenFor(user)}`)
        .expect(401)
      await request(app)
        .patch('/api/usuarios/me/password')
        .set('Authorization', `Bearer ${tokenFor(user)}`)
        .send({ password_actual: 'old-password', password_nueva: 'new-password' })
        .expect(401)
      expect(argon.verify).not.toHaveBeenCalled()
    },
  )

  it('requires a change after an administrative password reset and invalidates previous tokens', async () => {
    const user = useAccount({ ...account('ADMIN'), requiere_reset: false })
    const previous = tokenFor(user)
    await request(app)
      .patch('/api/usuarios/10')
      .set('Authorization', `Bearer ${previous}`)
      .send({ password: 'new-password' })
      .expect(200)
    expect(db.usuario.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ requiere_reset: true }) }),
    )
    expect(user.requiere_reset).toBe(true)
    await request(app)
      .get('/api/usuarios/me')
      .set('Authorization', `Bearer ${previous}`)
      .expect(401)
  })

  it('does not let an administrator clear the requirement through the generic user update', async () => {
    const user = useAccount({ ...account('ADMIN'), requiere_reset: false })
    await request(app)
      .patch('/api/usuarios/11')
      .set('Authorization', `Bearer ${tokenFor(user)}`)
      .send({ requiere_reset: false })
      .expect(400)
    expect(db.usuario.update).not.toHaveBeenCalled()
  })
})
